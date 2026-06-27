import { CONFIG } from "../config";
import { BOUNTY_REPO_NAMES, BOUNTY_REPO_PATHS } from "../data/bounty-repos";
import type { GitHubEvent, IdentifyFlag } from "../types";

const BOUNTY_LABEL_PATTERN = /\[\$\d+|\$\d+\s*(bounty|usd|usdc)/i;

function isBountyRepo(repoFullName: string): boolean {
	const lower = repoFullName.toLowerCase();
	if (BOUNTY_REPO_PATHS.has(lower)) return true;
	const name = lower.split("/")[1];
	return name !== undefined && BOUNTY_REPO_NAMES.has(name);
}

export function detectBountyLabelInfrastructure(
	events: GitHubEvent[],
): IdentifyFlag[] {
	const bountyLabeledIssues = events.filter(
		(e) =>
			e.type === "IssuesEvent" &&
			e.payload?.action === "labeled" &&
			e.repo?.name !== undefined &&
			isBountyRepo(e.repo.name) &&
			BOUNTY_LABEL_PATTERN.test(e.payload?.issue?.title ?? ""),
	);

	if (bountyLabeledIssues.length < CONFIG.BOUNTY_LABEL_MIN) return [];

	const repos = new Set(
		bountyLabeledIssues.map((e) => e.repo?.name).filter(Boolean),
	);

	return [
		{
			label: "Bounty infrastructure activity",
			points: CONFIG.POINTS_BOUNTY_LABEL_INFRA,
			amplifiable: true,
			detail: `${bountyLabeledIssues.length} issues labeled with bounty amounts across ${repos.size} known bounty repo${repos.size !== 1 ? "s" : ""}`,
			data: [
				{
					label: "Bounty-labeled issues",
					value: bountyLabeledIssues.length,
					threshold: CONFIG.BOUNTY_LABEL_MIN,
				},
				{ label: "Repos involved", value: repos.size },
			],
			events: bountyLabeledIssues,
		},
	];
}
