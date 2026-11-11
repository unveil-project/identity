import { CONFIG } from "../config";
import { isBountyRepo } from "../data/bounty-repos";
import type { ActivityEvent, Flag } from "../types";

/** Titles like "[$25 BOUNTY] ..." or "$50 USDC ...". */
const BOUNTY_LABEL_PATTERN = /\[\$\d+|\$\d+\s*(bounty|usd|usdc)/i;

function isBountyLabeling(event: ActivityEvent): boolean {
	return (
		event.type === "issue" &&
		event.action === "labeled" &&
		isBountyRepo(event.repo) &&
		BOUNTY_LABEL_PATTERN.test(event.issue?.title ?? "")
	);
}

/** Accounts that put bounty prices on issues are running a bounty campaign. */
export function detectBountyLabelInfrastructure(
	events: ActivityEvent[],
): Flag[] {
	const labeledIssues = events.filter(isBountyLabeling);

	if (labeledIssues.length < CONFIG.BOUNTY_LABEL_MIN) {
		return [];
	}

	const repos = new Set(labeledIssues.map((event) => event.repo));

	return [
		{
			id: "bounty-labels",
			points: CONFIG.POINTS_BOUNTY_LABEL_INFRA,
			group: "bounty",
			amplifiable: true,
			facts: { issues: labeledIssues.length, repos: repos.size },
			events: labeledIssues,
		},
	];
}
