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
	return events.some((e) => {
		const repo = e.repo?.name;
		return repo ? isBountyRepo(repo) : false;
	});
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

export function hasBountyLabelSignal(events: GitHubEvent[]): boolean {
	const labelEvents = events.filter(
		(e) => e.type === "IssuesEvent" && e.payload?.action === "labeled",
	);

	if (labelEvents.length < CONFIG.BOUNTY_REPO_LABEL_MIN) return false;

	const bountyLabelEvents = labelEvents.filter((e) => {
		const repo = e.repo?.name;
		return repo ? isBountyRepo(repo) : false;
	});

	return bountyLabelEvents.length >= CONFIG.BOUNTY_REPO_LABEL_MIN;
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

	return [{ label, points: 0, amplifiable: false, detail }];
}

export function detectBountyRepoIssueLabeling(
	events: GitHubEvent[],
): IdentifyFlag[] {
	if (!hasBountyLabelSignal(events)) return [];

	const labelEvents = events.filter(
		(e) => e.type === "IssuesEvent" && e.payload?.action === "labeled",
	);
	const bountyLabelEvents = labelEvents.filter((e) => {
		const repo = e.repo?.name;
		return repo ? isBountyRepo(repo) : false;
	});
	const repos = new Set(
		bountyLabelEvents.map((e) => e.repo?.name).filter(Boolean),
	);
	const detail = `${bountyLabelEvents.length} labeling events across ${repos.size} bounty program repositories`;

	const hasEngagement = events.some((e) => {
		const repo = e.repo?.name;
		if (!repo || !repos.has(repo)) return false;
		return (
			(e.type === "PullRequestEvent" && e.payload?.action === "opened") ||
			e.type === "IssueCommentEvent"
		);
	});

	if (!hasEngagement) {
		return [
			{
				label: "Bounty issue cataloging with no follow-up engagement",
				points: CONFIG.POINTS_BOUNTY_REPO_LABEL_NO_ENGAGEMENT,
				amplifiable: true,
				detail,
			},
		];
	}

	// This flag is purely informational since bounty programs are not always bad
	// we've see correlation between automation, spam and bounties, but cannot judget a book by its cover
	return [
		{
			label: "Issue management in known bounty program repositories",
			points: 0,
			amplifiable: false,
			detail,
		},
	];
}
