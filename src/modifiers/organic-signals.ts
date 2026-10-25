import { CONFIG } from "../config";
import { daysBetween, toTime } from "../time";
import type { IdentifyEvent } from "../types";

export function detectOrganicSignals(events: IdentifyEvent[]): number {
	let bonus = 0;

	if (events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return bonus;
	}

	// Issue engagement across repositories
	// Opening issues requires reading, understanding, and caring about a project —
	// something automated accounts almost never do. Issues spread across repos and
	// over time signal genuine participation in the ecosystem.
	const issueOpenEvents = events.filter(
		(e) => e.type === "issue" && e.action === "opened",
	);

	if (issueOpenEvents.length >= CONFIG.ORGANIC_ISSUE_MIN_COUNT) {
		const issueRepos = new Set(issueOpenEvents.map((e) => e.repo));

		if (issueRepos.size >= CONFIG.ORGANIC_ISSUE_MIN_REPOS) {
			const issueTimestamps = issueOpenEvents
				.map((e) => toTime(e.at))
				.sort((a, b) => a - b);

			const firstIssue = issueTimestamps[0];
			const lastIssue = issueTimestamps[issueTimestamps.length - 1];
			const timeSpanDays =
				firstIssue && lastIssue
					? Math.trunc(daysBetween(firstIssue, lastIssue))
					: 0;

			if (timeSpanDays >= CONFIG.ORGANIC_ISSUE_MIN_DAYS) {
				bonus += CONFIG.POINTS_ORGANIC_ISSUE_ENGAGEMENT;
			}
		}
	}

	// Merged PR signal — PRs the user submitted that were accepted by maintainers.
	// `isAuthor` distinguishes "user submitted this PR" from "user merged someone
	// else's PR as a maintainer".
	// Rate gate filters bots that spray many PRs and happen to land a few merges.
	const openedPREvents = events.filter(
		(e) => e.type === "pull-request" && e.action === "opened",
	);
	const mergedPREvents = events.filter(
		(e) =>
			e.type === "pull-request" &&
			e.action === "merged" &&
			e.pullRequest?.isAuthor === true,
	);

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
