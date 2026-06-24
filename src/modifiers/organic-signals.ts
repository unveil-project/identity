import dayjs from "dayjs";
import { CONFIG } from "../config";
import type { GitHubEvent } from "../types";

export function detectOrganicSignals(
	events: GitHubEvent[],
	accountName: string,
): number {
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

	// Merged PR signal — PRs the user submitted that were accepted by maintainers.
	// head.repo ownership check distinguishes "user submitted this PR" from
	// "user merged someone else's PR as a maintainer".
	// Rate gate filters bots that spray many PRs and happen to land a few merges.
	const accountNameLower = accountName.toLowerCase();

	const openedPREvents = events.filter(
		(e) => e.type === "PullRequestEvent" && e.payload?.action === "opened",
	);
	const mergedPREvents = events.filter((e) => {
		if (e.type !== "PullRequestEvent" || e.payload?.action !== "merged")
			return false;
		const headUrl =
			e.payload?.pull_request?.head?.repo?.url?.toLowerCase() ?? "";
		return headUrl.includes(`/repos/${accountNameLower}/`);
	});

	if (mergedPREvents.length >= CONFIG.ORGANIC_MERGED_PR_MIN) {
		// If we don't have enough opened PRs in the event window to calculate a
		// meaningful rate, skip the bonus rather than assuming a perfect rate.
		const mergeRate =
			openedPREvents.length >= CONFIG.ORGANIC_MERGED_PR_MIN_OPENED
				? mergedPREvents.length / openedPREvents.length
				: 0;

		if (mergeRate >= CONFIG.ORGANIC_MERGED_PR_MIN_RATE) {
			if (mergedPREvents.length >= CONFIG.ORGANIC_MERGED_PR_EXTREME) {
				bonus += CONFIG.POINTS_ORGANIC_MERGED_PR_EXTREME;
			} else if (mergedPREvents.length >= CONFIG.ORGANIC_MERGED_PR_HIGH) {
				bonus += CONFIG.POINTS_ORGANIC_MERGED_PR_HIGH;
			} else {
				bonus += CONFIG.POINTS_ORGANIC_MERGED_PR;
			}
		}
	}

	return bonus;
}
