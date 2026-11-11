import { CONFIG } from "../config";
import {
	isBranchCreation,
	isOpenedPR,
	type TimedEvent,
	toTimeline,
} from "../events";
import { isOwnRepo, nameOf } from "../repos";
import { secondsBetween } from "../time";
import type { ActivityEvent, EventConnection, Flag } from "../types";
import { groupBy } from "../utils";

type BranchPRMatch = {
	branch: TimedEvent;
	pr: TimedEvent;
	gapSeconds: number;
};

type BranchPRInput = {
	/** Every branch the account created, oldest first. */
	branches: TimedEvent[];
	/** Every PR the account opened, oldest first. */
	prs: TimedEvent[];
	login: string;
	isEstablished: boolean;
	minRatio: number;
};

/**
 * Pair each branch with the first PR that opens within
 * BRANCH_PR_TIME_WINDOW_SECONDS after it, among PRs with the same key (the
 * repository, or the project name). Each PR is used for one branch at most.
 * Both lists must be sorted oldest first.
 */
function pairBranchesWithPRs(
	branches: TimedEvent[],
	prs: TimedEvent[],
	keyOf: (event: ActivityEvent) => string | undefined,
	isPair: (branch: ActivityEvent, pr: ActivityEvent) => boolean,
): BranchPRMatch[] {
	const prsByKey = groupBy(prs, (pr) => keyOf(pr.event));
	// For each key, the index of the first PR not used or passed yet.
	const nextPRIndex = new Map<string, number>();
	const matches: BranchPRMatch[] = [];

	for (const branch of branches) {
		const key = keyOf(branch.event);
		if (key === undefined) {
			continue;
		}

		const candidates = prsByKey.get(key);
		if (!candidates) {
			continue;
		}

		let index = nextPRIndex.get(key) ?? 0;

		// PRs opened before the branch existed cannot come from it.
		while ((candidates[index]?.time ?? Infinity) < branch.time) {
			index++;
		}

		const pr = candidates[index];
		if (pr) {
			const gapSeconds = Math.trunc(secondsBetween(branch.time, pr.time));
			const isQuick = gapSeconds <= CONFIG.BRANCH_PR_TIME_WINDOW_SECONDS;

			if (isQuick && isPair(branch.event, pr.event)) {
				matches.push({ branch, pr, gapSeconds });
				index++;
			}
		}

		nextPRIndex.set(key, index);
	}

	return matches;
}

function connectionsOf(matches: BranchPRMatch[]): EventConnection[] {
	return matches.map((match) => ({
		from: match.branch.event,
		to: match.pr.event,
	}));
}

/** Every branch event first, then every PR event. */
function eventsOf(matches: BranchPRMatch[]): ActivityEvent[] {
	const branches = matches.map((match) => match.branch.event);
	const prs = matches.map((match) => match.pr.event);

	return [...branches, ...prs];
}

function longestGapOf(matches: BranchPRMatch[]): number {
	return Math.max(0, ...matches.map((match) => match.gapSeconds));
}

/**
 * The branch and the PR are in the same repository, and the account owns it.
 *
 * Only the account's own repos count here. Branching directly inside someone
 * else's repo requires push access that a maintainer had to grant, so those
 * are normal collaborators moving fast. An automation spraying PRs at repos it
 * has no access to has to fork first, and the fork check catches that.
 */
function detectOwnRepoPattern(input: BranchPRInput): Flag | undefined {
	const { branches, prs, login, isEstablished, minRatio } = input;
	const minPairs = isEstablished
		? CONFIG.BRANCH_PR_PATTERN_MIN_PAIRS_ESTABLISHED
		: CONFIG.BRANCH_PR_PATTERN_MIN_PAIRS;

	const ownBranches = branches.filter((b) => isOwnRepo(b.event.repo, login));
	const ownPRs = prs.filter((pr) => isOwnRepo(pr.event.repo, login));

	if (ownBranches.length < minPairs || ownPRs.length < minPairs) {
		return undefined;
	}

	// Far fewer branches than PRs means most PRs did not come from a fresh
	// branch, which is how a busy maintainer works.
	if (ownBranches.length / ownPRs.length < CONFIG.BRANCH_PR_COUNT_RATIO_MIN) {
		return undefined;
	}

	const matches = pairBranchesWithPRs(
		ownBranches,
		ownPRs,
		(event) => event.repo,
		() => true,
	);
	if (matches.length < minPairs) {
		return undefined;
	}

	// The ratio compares matches found in the account's own repos against
	// every branch it created anywhere. That is on purpose: labelling a real
	// person as a bot is costly, and the bigger denominator stops someone who
	// branches all over the place, and happens to be quick in a couple of
	// their own repos, from tripping this flag.
	const ratio = matches.length / branches.length;
	if (ratio < minRatio) {
		return undefined;
	}

	return {
		id: "branch-pr-pattern",
		points: CONFIG.POINTS_BRANCH_PR_AUTOMATION,
		group: "branch-pr",
		amplifiable: true,
		facts: {
			pairs: matches.length,
			minPairs,
			branches: branches.length,
			ownBranches: ownBranches.length,
			ratio,
			minRatio,
			maxGapSeconds: longestGapOf(matches),
		},
		events: eventsOf(matches),
		connections: connectionsOf(matches),
	};
}

/**
 * The branch is in the account's fork and the PR goes to the original project:
 * same repository name, different owner. Established accounts need fewer
 * matches here, because this pattern is already a much narrower signal.
 */
function detectForkPattern(input: BranchPRInput): Flag | undefined {
	const { branches, prs, login, isEstablished, minRatio } = input;
	const minPairs = isEstablished
		? CONFIG.BRANCH_PR_FORK_MIN_PAIRS_ESTABLISHED
		: CONFIG.BRANCH_PR_PATTERN_MIN_PAIRS;

	if (branches.length < minPairs || prs.length < minPairs) {
		return undefined;
	}

	const matches = pairBranchesWithPRs(
		branches,
		prs,
		(event) => nameOf(event.repo),
		(branch, pr) => isOwnRepo(branch.repo, login) && !isOwnRepo(pr.repo, login),
	);
	if (matches.length < minPairs) {
		return undefined;
	}

	const ratio = matches.length / branches.length;
	if (ratio < minRatio) {
		return undefined;
	}

	return {
		id: "fork-pr-pattern",
		points: CONFIG.POINTS_BRANCH_PR_AUTOMATION,
		group: "branch-pr",
		amplifiable: true,
		facts: {
			pairs: matches.length,
			minPairs,
			branches: branches.length,
			ratio,
			minRatio,
			maxGapSeconds: longestGapOf(matches),
		},
		events: eventsOf(matches),
		connections: connectionsOf(matches),
	};
}

/**
 * Looks for branches that turn into a pull request almost immediately, again
 * and again. People can be this fast too (branch, push, `gh pr create`), so a
 * match is a hint that something is automated, not proof of it.
 */
export function detectBranchPRAutomation(
	events: ActivityEvent[],
	isEstablished: boolean,
	accountName: string,
): Flag[] {
	const input: BranchPRInput = {
		branches: toTimeline(events.filter(isBranchCreation)),
		prs: toTimeline(events.filter(isOpenedPR)),
		login: accountName,
		isEstablished,
		minRatio: isEstablished
			? CONFIG.BRANCH_PR_PATTERN_RATIO_MIN_ESTABLISHED
			: CONFIG.BRANCH_PR_PATTERN_RATIO_MIN,
	};

	const flag = detectOwnRepoPattern(input) ?? detectForkPattern(input);
	if (!flag) {
		return [];
	}

	return [flag];
}
