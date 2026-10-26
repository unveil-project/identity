import { CONFIG } from "../config";
import { BOUNTY_REPO_NAMES, BOUNTY_REPO_PATHS } from "../data/bounty-repos";
import type { ActivityEvent, Flag } from "../types";
import { nameOf } from "../utils";

const BOUNTY_LABEL_PATTERN = /\[\$\d+|\$\d+\s*(bounty|usd|usdc)/i;

function isBountyRepo(repoFullName: string): boolean {
	const lower = repoFullName.toLowerCase();
	if (BOUNTY_REPO_PATHS.has(lower)) {
		return true;
	}

	const name = nameOf(lower);

	return name !== undefined && BOUNTY_REPO_NAMES.has(name);
}

export function detectBountyLabelInfrastructure(
	events: ActivityEvent[],
): Flag[] {
	const bountyLabeledIssues = events.filter(
		(e) =>
			e.type === "issue" &&
			e.action === "labeled" &&
			isBountyRepo(e.repo) &&
			BOUNTY_LABEL_PATTERN.test(e.issue?.title ?? ""),
	);

	if (bountyLabeledIssues.length < CONFIG.BOUNTY_LABEL_MIN) {
		return [];
	}

	const repos = new Set(bountyLabeledIssues.map((e) => e.repo).filter(Boolean));

	return [
		{
			id: "bounty-labels",
			points: CONFIG.POINTS_BOUNTY_LABEL_INFRA,
			group: "bounty",
			amplifiable: true,
			facts: { issues: bountyLabeledIssues.length, repos: repos.size },
			events: bountyLabeledIssues,
		},
	];
}
