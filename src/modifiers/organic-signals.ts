import { CONFIG } from "../config";
import { eventTime, isOpenedPR } from "../events";
import { spanDays } from "../time";
import type { ActivityEvent } from "../types";
import { levelFor } from "../utils";

const MERGED_PR_LEVELS = [
	{
		min: CONFIG.ORGANIC_MERGED_PR_MIN,
		points: CONFIG.POINTS_ORGANIC_MERGED_PR,
	},
	{
		min: CONFIG.ORGANIC_MERGED_PR_HIGH,
		points: CONFIG.POINTS_ORGANIC_MERGED_PR_HIGH,
	},
	{
		min: CONFIG.ORGANIC_MERGED_PR_EXTREME,
		points: CONFIG.POINTS_ORGANIC_MERGED_PR_EXTREME,
	},
] as const;

/**
 * Opening issues takes reading, understanding and caring about a project,
 * which automated accounts almost never do. Issues spread over several repos
 * and over time are a sign of real participation.
 */
function issueEngagementBonus(events: ActivityEvent[]): number {
	const issues = events.filter(
		(event) => event.type === "issue" && event.action === "opened",
	);
	if (issues.length < CONFIG.ORGANIC_ISSUE_MIN_COUNT) {
		return 0;
	}

	const repos = new Set(issues.map((issue) => issue.repo));
	if (repos.size < CONFIG.ORGANIC_ISSUE_MIN_REPOS) {
		return 0;
	}

	const days = Math.trunc(spanDays(issues.map(eventTime)));
	if (days < CONFIG.ORGANIC_ISSUE_MIN_DAYS) {
		return 0;
	}

	return CONFIG.POINTS_ORGANIC_ISSUE_ENGAGEMENT;
}

/**
 * PRs the account wrote that maintainers merged. `isAuthor` tells "wrote this
 * PR" apart from "merged someone else's PR as a maintainer". The merge rate
 * filters out bots that spray many PRs and happen to land a few.
 */
function mergedPRBonus(events: ActivityEvent[]): number {
	const opened = events.filter(isOpenedPR);
	const merged = events.filter(
		(event) =>
			event.type === "pull-request" &&
			event.action === "merged" &&
			event.pullRequest?.isAuthor === true,
	);

	// Without enough opened PRs there is no rate to trust, so no bonus.
	if (opened.length < CONFIG.ORGANIC_MERGED_PR_MIN_OPENED) {
		return 0;
	}

	const mergeRate = merged.length / opened.length;
	if (mergeRate < CONFIG.ORGANIC_MERGED_PR_MIN_RATE) {
		return 0;
	}

	return levelFor(merged.length, MERGED_PR_LEVELS)?.points ?? 0;
}

/** Points given back for signs of a real person. */
export function detectOrganicSignals(events: ActivityEvent[]): number {
	if (events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return 0;
	}

	return issueEngagementBonus(events) + mergedPRBonus(events);
}
