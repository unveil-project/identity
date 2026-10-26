import { CONFIG } from "../config";
import { BOUNTY_REPO_NAMES, BOUNTY_REPO_PATHS } from "../data/bounty-repos";
import type { ActivityEvent, Flag } from "../types";
import { nameOf } from "../utils";

function isBountyRepo(repoFullName: string): boolean {
	const lower = repoFullName.toLowerCase();
	if (BOUNTY_REPO_PATHS.has(lower)) {
		return true;
	}

	const name = nameOf(lower);

	return name !== undefined && BOUNTY_REPO_NAMES.has(name);
}

export function hasBountyRepoEngagement(events: ActivityEvent[]): boolean {
	const openedPRsInBountyRepos = events.filter(
		(e) =>
			e.type === "pull-request" &&
			e.action === "opened" &&
			e.repo &&
			isBountyRepo(e.repo),
	);

	return openedPRsInBountyRepos.length >= CONFIG.BOUNTY_REPO_MIN_PRS;
}

export function getBountyPRSignal(
	events: ActivityEvent[],
): "high" | "low" | null {
	const openedPRs = events.filter(
		(e) => e.type === "pull-request" && e.action === "opened",
	);

	if (openedPRs.length < CONFIG.BOUNTY_REPO_MIN_PRS) {
		return null;
	}

	const bountyPRs = openedPRs.filter((e) => {
		const repo = e.repo;

		return repo ? isBountyRepo(repo) : false;
	});

	if (bountyPRs.length === 0) {
		return null;
	}

	const ratio = bountyPRs.length / openedPRs.length;
	if (ratio < CONFIG.BOUNTY_REPO_RATIO_LOW) {
		return null;
	}

	const mergedBountyPRs = events.filter(
		(e) =>
			e.type === "pull-request" &&
			e.action === "merged" &&
			e.repo &&
			isBountyRepo(e.repo),
	);

	const closedBountyPRs = events.filter(
		(e) =>
			e.type === "pull-request" &&
			e.action === "closed" &&
			e.repo &&
			isBountyRepo(e.repo),
	);

	const resolvedCount = mergedBountyPRs.length + closedBountyPRs.length;
	if (resolvedCount > 0) {
		const mergeRate = mergedBountyPRs.length / resolvedCount;
		if (mergeRate >= CONFIG.BOUNTY_REPO_MERGE_RATE_CLEAN) {
			return null;
		}
	}

	return ratio >= CONFIG.BOUNTY_REPO_RATIO_HIGH ? "high" : "low";
}

export function detectBountyRepoPRs(events: ActivityEvent[]): Flag[] {
	const signal = getBountyPRSignal(events);
	if (!signal) {
		return [];
	}

	const openedPRs = events.filter(
		(e) => e.type === "pull-request" && e.action === "opened",
	);
	const bountyPRs = openedPRs.filter((e) => {
		const repo = e.repo;

		return repo ? isBountyRepo(repo) : false;
	});
	const mergedBountyPRs = events.filter(
		(e) =>
			e.type === "pull-request" &&
			e.action === "merged" &&
			e.repo &&
			isBountyRepo(e.repo),
	);

	const closedBountyPRs = events.filter(
		(e) =>
			e.type === "pull-request" &&
			e.action === "closed" &&
			e.repo &&
			isBountyRepo(e.repo),
	);

	return [
		{
			id: signal === "high" ? "bounty-prs-high" : "bounty-prs-low",
			points: 0,
			group: "bounty",
			amplifiable: false,
			facts: {
				bountyPRs: bountyPRs.length,
				openedPRs: openedPRs.length,
				ratio: bountyPRs.length / openedPRs.length,
				merged: mergedBountyPRs.length,
				closed: closedBountyPRs.length,
			},
			events: [...bountyPRs, ...mergedBountyPRs, ...closedBountyPRs],
		},
	];
}
