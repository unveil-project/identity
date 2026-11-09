import { CONFIG } from "../config";
import { isOpenedPR, type TimedEvent, toTimeline } from "../events";
import { secondsBetween } from "../time";
import type { ActivityEvent, Flag } from "../types";
import { groupBy } from "../utils";

type RapidRun = {
	/** Back-to-back PR pairs in the run: a run of 5 PRs has 4 pairs. */
	pairs: number;
	/** The longest wait between two PRs in the run. */
	maxGapSeconds: number;
	/** Index of the first PR in the run. */
	start: number;
	/** Index of the last PR in the run. */
	end: number;
};

/**
 * The longest run of PRs where each one came within RAPID_PR_MAX_GAP_SECONDS of
 * the one before. The PRs must be sorted oldest first.
 */
function longestRapidRun(prs: TimedEvent[]): RapidRun {
	let longest: RapidRun = { pairs: 0, maxGapSeconds: 0, start: 0, end: 0 };
	let current: RapidRun = { ...longest };

	for (let i = 1; i < prs.length; i++) {
		const gapSeconds = Math.trunc(
			secondsBetween(prs[i - 1]?.time ?? 0, prs[i]?.time ?? 0),
		);

		if (gapSeconds <= CONFIG.RAPID_PR_MAX_GAP_SECONDS) {
			current = {
				pairs: current.pairs + 1,
				maxGapSeconds: Math.max(current.maxGapSeconds, gapSeconds),
				start: current.start,
				end: i,
			};
		} else {
			current = { pairs: 0, maxGapSeconds: 0, start: i, end: i };
		}

		if (current.pairs > longest.pairs) {
			longest = current;
		}
	}

	return longest;
}

/**
 * Several PRs to the same repository, each within a minute or so of the last:
 * faster than anyone can write, test and describe a change.
 */
export function detectRapidPRSpam(
	events: ActivityEvent[],
	isEstablished: boolean,
): Flag[] {
	const minPRs = isEstablished
		? CONFIG.RAPID_PR_SPAM_MIN_PRS_ESTABLISHED
		: CONFIG.RAPID_PR_SPAM_MIN_PRS;

	const prs = events.filter(isOpenedPR);
	if (prs.length < minPRs) {
		return [];
	}

	const prsByRepo = groupBy(toTimeline(prs), (pr) => pr.event.repo);
	let fastest: (RapidRun & { repo: string; prs: TimedEvent[] }) | undefined;

	for (const [repo, repoPRs] of prsByRepo) {
		if (repoPRs.length < minPRs) {
			continue;
		}

		const run = longestRapidRun(repoPRs);
		if (!fastest || run.pairs > fastest.pairs) {
			fastest = { ...run, repo, prs: repoPRs };
		}
	}

	// A run of N PRs has N - 1 pairs.
	if (!fastest || fastest.pairs < minPRs - 1) {
		return [];
	}

	const runPRs = fastest.prs
		.slice(fastest.start, fastest.end + 1)
		.map((pr) => pr.event);

	return [
		{
			id: "rapid-prs",
			points: CONFIG.POINTS_RAPID_PR_SPAM,
			group: "branch-pr",
			amplifiable: true,
			facts: {
				prs: fastest.pairs + 1,
				minPRs,
				repo: fastest.repo,
				maxGapSeconds: fastest.maxGapSeconds,
			},
			events: runPRs,
		},
	];
}
