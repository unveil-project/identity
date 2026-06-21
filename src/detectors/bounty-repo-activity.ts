import { CONFIG } from "../config";
import { BOUNTY_REPO_NAMES, BOUNTY_REPO_PATHS } from "../data/bounty-repos";
import type { GitHubEvent, IdentifyFlag } from "../types";

function isBountyRepo(repoFullName: string): boolean {
	const lower = repoFullName.toLowerCase();
	if (BOUNTY_REPO_PATHS.has(lower)) return true;
	const name = lower.split("/")[1];
	return name !== undefined && BOUNTY_REPO_NAMES.has(name);
}

export function detectBountyRepoPRs(events: GitHubEvent[]): IdentifyFlag[] {
	const openedPRs = events.filter(
		(e) => e.type === "PullRequestEvent" && e.payload?.action === "opened",
	);

	if (openedPRs.length < CONFIG.BOUNTY_REPO_MIN_PRS) return [];

	const bountyPRs = openedPRs.filter((e) => {
		const repo = e.repo?.name;
		return repo ? isBountyRepo(repo) : false;
	});

	if (bountyPRs.length === 0) return [];

	const ratio = bountyPRs.length / openedPRs.length;
	const pct = Math.round(ratio * 100);
	const detail = `${bountyPRs.length} of ${openedPRs.length} opened PRs (${pct}%) target bounty program repositories`;

	if (ratio >= CONFIG.BOUNTY_REPO_RATIO_HIGH) {
		return [
			{
				label: "High PR activity in bounty repositories",
				points: CONFIG.POINTS_BOUNTY_REPO_HIGH,
				amplifiable: true,
				detail,
			},
		];
	}

	if (ratio >= CONFIG.BOUNTY_REPO_RATIO_LOW) {
		return [
			{
				label: "PR activity in bounty repositories",
				points: CONFIG.POINTS_BOUNTY_REPO_LOW,
				amplifiable: false,
				detail,
			},
		];
	}

	return [];
}

export function detectBountyRepoIssueLabeling(
	events: GitHubEvent[],
): IdentifyFlag[] {
	const labelEvents = events.filter(
		(e) => e.type === "IssuesEvent" && e.payload?.action === "labeled",
	);

	if (labelEvents.length < CONFIG.BOUNTY_REPO_LABEL_MIN) return [];

	const bountyLabelEvents = labelEvents.filter((e) => {
		const repo = e.repo?.name;
		return repo ? isBountyRepo(repo) : false;
	});

	if (bountyLabelEvents.length < CONFIG.BOUNTY_REPO_LABEL_MIN) return [];

	const repos = new Set(bountyLabelEvents.map((e) => e.repo?.name));
	const detail = `${bountyLabelEvents.length} labeling events across ${repos.size} bounty program repositories`;

	return [
		{
			label: "Issue activity in bounty repositories",
			points: CONFIG.POINTS_BOUNTY_REPO_LABEL,
			amplifiable: false,
			detail,
		},
	];
}
