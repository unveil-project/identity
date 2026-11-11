import { CONFIG } from "../config";
import { isBountyRepo } from "../data/bounty-repos";
import { isOpenedPR } from "../events";
import type { ActivityEvent, Flag } from "../types";

type BountyPRs = {
	/** Every PR the account opened. */
	opened: ActivityEvent[];
	/** The opened PRs that target bounty repos. */
	toBountyRepos: ActivityEvent[];
	/** PRs merged in bounty repos. */
	merged: ActivityEvent[];
	/** PRs closed without a merge in bounty repos. */
	closed: ActivityEvent[];
};

export type BountyPRSignal = "high" | "low";

function bountyPROutcome(event: ActivityEvent, action: string): boolean {
	return (
		event.type === "pull-request" &&
		event.action === action &&
		isBountyRepo(event.repo)
	);
}

function collectBountyPRs(events: ActivityEvent[]): BountyPRs {
	const opened = events.filter(isOpenedPR);

	return {
		opened,
		toBountyRepos: opened.filter((event) => isBountyRepo(event.repo)),
		merged: events.filter((event) => bountyPROutcome(event, "merged")),
		closed: events.filter((event) => bountyPROutcome(event, "closed")),
	};
}

/**
 * How strongly the account's PRs lean towards bounty repos, or null when they
 * do not. Contributors who get most of their bounty PRs merged are doing real
 * work, so they get no signal.
 */
function bountySignalOf(prs: BountyPRs): BountyPRSignal | null {
	if (
		prs.opened.length < CONFIG.BOUNTY_REPO_MIN_PRS ||
		prs.toBountyRepos.length === 0
	) {
		return null;
	}

	const ratio = prs.toBountyRepos.length / prs.opened.length;
	if (ratio < CONFIG.BOUNTY_REPO_RATIO_LOW) {
		return null;
	}

	const resolved = prs.merged.length + prs.closed.length;
	if (resolved > 0) {
		const mergeRate = prs.merged.length / resolved;
		if (mergeRate >= CONFIG.BOUNTY_REPO_MERGE_RATE_CLEAN) {
			return null;
		}
	}

	if (ratio >= CONFIG.BOUNTY_REPO_RATIO_HIGH) {
		return "high";
	}

	return "low";
}

export function hasBountyRepoEngagement(events: ActivityEvent[]): boolean {
	const prs = collectBountyPRs(events);

	return prs.toBountyRepos.length >= CONFIG.BOUNTY_REPO_MIN_PRS;
}

export function getBountyPRSignal(
	events: ActivityEvent[],
): BountyPRSignal | null {
	return bountySignalOf(collectBountyPRs(events));
}

export function detectBountyRepoPRs(events: ActivityEvent[]): Flag[] {
	const prs = collectBountyPRs(events);
	const signal = bountySignalOf(prs);
	if (!signal) {
		return [];
	}

	return [
		{
			id: signal === "high" ? "bounty-prs-high" : "bounty-prs-low",
			points: 0,
			group: "bounty",
			amplifiable: false,
			facts: {
				bountyPRs: prs.toBountyRepos.length,
				openedPRs: prs.opened.length,
				ratio: prs.toBountyRepos.length / prs.opened.length,
				merged: prs.merged.length,
				closed: prs.closed.length,
			},
			events: [...prs.toBountyRepos, ...prs.merged, ...prs.closed],
		},
	];
}
