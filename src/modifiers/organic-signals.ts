import dayjs from "dayjs";
import { CONFIG } from "../config";
import type { GitHubEvent } from "../types";

export function detectOrganicSignals(events: GitHubEvent[]): number {
	let bonus = 0;

	if (events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return bonus;
	}

	// Issue engagement across repositories
	// Opening issues requires reading, understanding, and caring about a project —
	// something automated accounts almost never do. Issues spread across repos and
	// over time signal genuine participation in the ecosystem.
	const issueOpenEvents = events.filter(
		(e) => e.type === "IssuesEvent" && e.payload?.action === "opened",
	);

	if (issueOpenEvents.length >= CONFIG.ORGANIC_ISSUE_MIN_COUNT) {
		const issueRepos = new Set(
			issueOpenEvents
				.map((e) => e.repo?.name)
				.filter((name): name is string => name !== undefined),
		);

		if (issueRepos.size >= CONFIG.ORGANIC_ISSUE_MIN_REPOS) {
			const issueTimestamps = issueOpenEvents
				.map((e) => dayjs(e.created_at))
				.sort((a, b) => a.valueOf() - b.valueOf());

			const firstIssue = issueTimestamps[0];
			const lastIssue = issueTimestamps[issueTimestamps.length - 1];
			const timeSpanDays =
				firstIssue && lastIssue ? lastIssue.diff(firstIssue, "day") : 0;

			if (timeSpanDays >= CONFIG.ORGANIC_ISSUE_MIN_DAYS) {
				bonus += CONFIG.POINTS_ORGANIC_ISSUE_ENGAGEMENT;
			}
		}
	}

	return bonus;
}
