import { CONFIG } from "../config";
import { BOUNTY_REPO_NAMES, BOUNTY_REPO_PATHS } from "../data/bounty-repos";
import type { GitHubEvent, IdentifyFlag } from "../types";

function isBountyRepo(repoFullName: string): boolean {
	const lower = repoFullName.toLowerCase();
	if (BOUNTY_REPO_PATHS.has(lower)) return true;
	const name = lower.split("/")[1];
	return name !== undefined && BOUNTY_REPO_NAMES.has(name);
}

export function hasBountyRepoEngagement(events: GitHubEvent[]): boolean {
	const openedPRsInBountyRepos = events.filter(
		(e) =>
			e.type === "PullRequestEvent" &&
			e.payload?.action === "opened" &&
			e.repo?.name &&
			isBountyRepo(e.repo.name),
	);
	return openedPRsInBountyRepos.length >= CONFIG.BOUNTY_REPO_MIN_PRS;
}

export function getBountyPRSignal(
	events: GitHubEvent[],
): "high" | "low" | null {
	const openedPRs = events.filter(
		(e) => e.type === "PullRequestEvent" && e.payload?.action === "opened",
	);

	if (openedPRs.length < CONFIG.BOUNTY_REPO_MIN_PRS) return null;

	const bountyPRs = openedPRs.filter((e) => {
		const repo = e.repo?.name;
		return repo ? isBountyRepo(repo) : false;
	});

	if (bountyPRs.length === 0) return null;

	const ratio = bountyPRs.length / openedPRs.length;
	if (ratio < CONFIG.BOUNTY_REPO_RATIO_LOW) return null;

	const mergedBountyPRs = events.filter(
		(e) =>
			e.type === "PullRequestEvent" &&
			e.payload?.action === "merged" &&
			e.repo?.name &&
			isBountyRepo(e.repo.name),
	);

	const closedBountyPRs = events.filter(
		(e) =>
			e.type === "PullRequestEvent" &&
			e.payload?.action === "closed" &&
			e.repo?.name &&
			isBountyRepo(e.repo.name),
	);

	const resolvedCount = mergedBountyPRs.length + closedBountyPRs.length;
	if (resolvedCount > 0) {
		const mergeRate = mergedBountyPRs.length / resolvedCount;
		if (mergeRate >= CONFIG.BOUNTY_REPO_MERGE_RATE_CLEAN) return null;
	}

	return ratio >= CONFIG.BOUNTY_REPO_RATIO_HIGH ? "high" : "low";
}

export function detectBountyRepoPRs(events: GitHubEvent[]): IdentifyFlag[] {
	const signal = getBountyPRSignal(events);
	if (!signal) return [];

	const openedPRs = events.filter(
		(e) => e.type === "PullRequestEvent" && e.payload?.action === "opened",
	);
	const bountyPRs = openedPRs.filter((e) => {
		const repo = e.repo?.name;
		return repo ? isBountyRepo(repo) : false;
	});
	const mergedBountyPRs = events.filter(
		(e) =>
			e.type === "PullRequestEvent" &&
			e.payload?.action === "merged" &&
			e.repo?.name &&
			isBountyRepo(e.repo.name),
	);

	const closedBountyPRs = events.filter(
		(e) =>
			e.type === "PullRequestEvent" &&
			e.payload?.action === "closed" &&
			e.repo?.name &&
			isBountyRepo(e.repo.name),
	);

	const ratio = bountyPRs.length / openedPRs.length;
	const pct = Math.round(ratio * 100);

	const detail =
		mergedBountyPRs.length + closedBountyPRs.length > 0
			? `${bountyPRs.length} of ${openedPRs.length} opened PRs (${pct}%) target known bounty program repositories; ${mergedBountyPRs.length} merged, ${closedBountyPRs.length} closed without merge`
			: `${bountyPRs.length} of ${openedPRs.length} opened PRs (${pct}%) target known bounty program repositories`;

	const label =
		signal === "high"
			? "PRs predominantly targeting known bounty program repositories"
			: "PR activity in known bounty program repositories";

	return [
		{
			label,
			points: 0,
			amplifiable: false,
			detail,
			data: [
				{ label: "PRs to bounty repos", value: bountyPRs.length },
				{ label: "Total PRs opened", value: openedPRs.length },
				{ label: "Bounty PR ratio", value: `${pct}%` },
				{ label: "Merged", value: mergedBountyPRs.length },
				{ label: "Closed without merge", value: closedBountyPRs.length },
			],
			events: [...bountyPRs, ...mergedBountyPRs, ...closedBountyPRs],
		},
	];
}
