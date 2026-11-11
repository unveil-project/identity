import { CONFIG } from "../config";
import {
	densestEventWindow,
	eventTime,
	externalEventsOf,
	hasHomeOwner,
	isOpenedPR,
} from "../events";
import { spanDays } from "../time";
import type { ActivityEvent, ActivityEventType, Flag } from "../types";
import { levelFor } from "../utils";

const YOUNG_PR_VOLUME_LEVELS = [
	{
		min: CONFIG.YOUNG_PRS_PER_DAY_HIGH,
		id: "young-pr-volume-high",
		points: CONFIG.POINTS_YOUNG_PR_VOLUME_HIGH,
	},
	{
		min: CONFIG.YOUNG_PRS_PER_DAY_EXTREME,
		id: "young-pr-volume-extreme",
		points: CONFIG.POINTS_YOUNG_PR_VOLUME_EXTREME,
	},
] as const;

const REPO_SPREAD_LEVELS = [
	{
		min: CONFIG.REPO_SPREAD_HIGH,
		id: "repo-spread-high",
		points: CONFIG.POINTS_WIDE_REPO_SPREAD_YOUNG,
	},
	{
		min: CONFIG.REPO_SPREAD_EXTREME,
		id: "repo-spread-extreme",
		points: CONFIG.POINTS_EXTREME_REPO_SPREAD_YOUNG,
	},
] as const;

/** Event types where the account takes part in a project beyond its own code. */
const ENGAGEMENT_TYPES: ReadonlySet<ActivityEventType> = new Set([
	"issue",
	"issue-comment",
	"star",
	"review",
	"review-comment",
	"commit-comment",
]);

/** Many PRs per day, on average, over the days the PRs cover. */
function detectYoungPRVolume(prs: ActivityEvent[]): Flag[] {
	if (prs.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return [];
	}

	const days = Math.max(1, Math.trunc(spanDays(prs.map(eventTime))));
	const perDay = prs.length / days;
	const level = levelFor(perDay, YOUNG_PR_VOLUME_LEVELS);
	if (!level) {
		return [];
	}

	return [
		{
			id: level.id,
			points: level.points,
			group: "pr-volume",
			amplifiable: true,
			facts: { prs: prs.length, spanDays: days, perDay },
			events: prs,
		},
	];
}

/**
 * Activity on many other people's repositories. Only young accounts are
 * checked: established open source developers often contribute widely.
 */
function detectRepoSpread(external: ActivityEvent[]): Flag[] {
	const repos = new Set(external.map((event) => event.repo));
	const level = levelFor(repos.size, REPO_SPREAD_LEVELS);
	if (!level) {
		return [];
	}

	return [
		{
			id: level.id,
			points: level.points,
			group: "repo-spread",
			amplifiable: true,
			facts: { repos: repos.size, externalEvents: external.length },
			events: external,
		},
	];
}

/** The busiest day, or else the busiest week, of PRs to other people's repos. */
function detectExternalPRBursts(externalPRs: ActivityEvent[]): Flag[] {
	const day = densestEventWindow(externalPRs, 24);
	if (day.count >= CONFIG.PRS_TODAY_EXTREME) {
		return [
			{
				id: "external-pr-day",
				points: CONFIG.POINTS_PR_BURST,
				group: "pr-volume",
				amplifiable: true,
				facts: { prs: day.count },
				events: day.items,
			},
		];
	}

	const week = densestEventWindow(externalPRs, 24 * 7);
	if (week.count >= CONFIG.PRS_WEEK_HIGH) {
		return [
			{
				id: "external-pr-week",
				points: CONFIG.POINTS_HIGH_PR_FREQUENCY,
				group: "pr-volume",
				amplifiable: true,
				facts: { prs: week.count },
				events: week.items,
			},
		];
	}

	return [];
}

/**
 * Nearly everything happens on other people's repos, with few of its own.
 * A new account that works mostly in one organization's repos is a new team
 * member, not a drive-by, so it is left alone.
 */
function detectExternalFocus(
	events: ActivityEvent[],
	external: ActivityEvent[],
	externalPRs: ActivityEvent[],
	reposCount: number,
): Flag[] {
	if (hasHomeOwner(external)) {
		return [];
	}

	const flags: Flag[] = [];
	const hasFewRepos = reposCount < CONFIG.PERSONAL_REPOS_LOW;

	if (hasFewRepos && externalPRs.length >= CONFIG.EXTERNAL_PRS_MIN) {
		flags.push({
			id: "external-contributor",
			points: CONFIG.POINTS_PR_ONLY_CONTRIBUTOR,
			group: "external-focus",
			amplifiable: true,
			facts: { externalPRs: externalPRs.length, ownRepos: reposCount },
			events: externalPRs,
		});
	}

	const ratio = external.length / events.length;
	if (
		hasFewRepos &&
		external.length > 0 &&
		ratio >= CONFIG.FOREIGN_RATIO_HIGH
	) {
		flags.push({
			id: "mostly-external",
			points: CONFIG.POINTS_EXTERNAL_FOCUS,
			group: "external-focus",
			amplifiable: true,
			facts: {
				ratio,
				externalEvents: external.length,
				totalEvents: events.length,
				ownRepos: reposCount,
			},
			events: external,
		});
	}

	return flags;
}

/**
 * People who contribute to other projects usually also file issues, comment,
 * review or star along the way. A young account that only sends PRs is
 * contributing without taking part.
 */
function detectLimitedEngagement(
	events: ActivityEvent[],
	externalPRs: ActivityEvent[],
): Flag[] {
	const hasEngagement = events.some((event) =>
		ENGAGEMENT_TYPES.has(event.type),
	);

	if (hasEngagement || externalPRs.length < CONFIG.LIMITED_ENGAGEMENT_MIN_PRS) {
		return [];
	}

	return [
		{
			id: "limited-engagement",
			points: CONFIG.POINTS_LIMITED_ENGAGEMENT,
			group: "engagement",
			amplifiable: true,
			facts: { externalPRs: externalPRs.length },
			events: externalPRs,
		},
	];
}

/** Checks that only make sense for accounts that are a few weeks old. */
export function detectYoungAccountActivity(
	events: ActivityEvent[],
	reposCount: number,
	isNewOrYoungAccount: boolean,
	accountName: string,
): Flag[] {
	if (!isNewOrYoungAccount || events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return [];
	}

	const prs = events.filter(isOpenedPR);
	const external = externalEventsOf(events, accountName);
	const externalPRs = external.filter(isOpenedPR);

	return [
		...detectYoungPRVolume(prs),
		...detectRepoSpread(external),
		...detectExternalPRBursts(externalPRs),
		...detectExternalFocus(events, external, externalPRs, reposCount),
		...detectLimitedEngagement(events, externalPRs),
	];
}
