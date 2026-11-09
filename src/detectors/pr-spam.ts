import { CONFIG } from "../config";
import { densestEventWindow, eventTime, isOpenedPR } from "../events";
import { spanDays } from "../time";
import type { ActivityEvent, Flag } from "../types";
import { levelFor, type RampAnchor, rampPoints } from "../utils";

const PR_WEEK_LEVELS = [
	{ min: CONFIG.PRS_WEEK_VERY_HIGH, id: "pr-volume-week-high" },
	{ min: CONFIG.PRS_WEEK_EXTREME, id: "pr-volume-week-extreme" },
] as const;

const PR_WEEK_RAMP: readonly RampAnchor[] = [
	[CONFIG.PRS_WEEK_VERY_HIGH, CONFIG.POINTS_PRS_WEEK_VERY_HIGH],
	[CONFIG.PRS_WEEK_EXTREME, CONFIG.POINTS_PRS_WEEK_EXTREME],
];

/**
 * The busiest 24 hours and the busiest 7 days anywhere in the data, not the
 * last 24 hours or 7 days before today. The speed is the signal, not the total.
 */
function detectPRBursts(prs: ActivityEvent[]): Flag[] {
	const flags: Flag[] = [];

	const day = densestEventWindow(prs, 24);
	if (day.count >= CONFIG.PRS_DAY_EXTREME) {
		flags.push({
			id: "pr-volume-day",
			points: CONFIG.POINTS_PRS_DAY_EXTREME,
			group: "pr-volume",
			amplifiable: true,
			facts: { prs: day.count },
			events: day.items,
		});
	}

	const week = densestEventWindow(prs, 24 * 7);
	const weekLevel = levelFor(week.count, PR_WEEK_LEVELS);
	if (weekLevel) {
		flags.push({
			id: weekLevel.id,
			points: rampPoints(week.count, PR_WEEK_RAMP),
			group: "pr-volume",
			amplifiable: true,
			facts: { prs: week.count },
			events: week.items,
		});
	}

	return flags;
}

/**
 * Many PRs spread over many repositories. Long-time contributors reach these
 * totals too, so the PRs must also come fast: many per week on average, or a
 * very busy month.
 */
function detectDistributedPRs(prs: ActivityEvent[]): Flag[] {
	if (prs.length < CONFIG.PRS_SPAM_VOLUME) {
		return [];
	}

	const repos = new Set(prs.map((pr) => pr.repo));
	if (repos.size < CONFIG.REPOS_SPAM_SPREAD) {
		return [];
	}

	const weeks = spanDays(prs.map(eventTime)) / 7;
	const perWeek = weeks > 0 ? prs.length / weeks : Number.POSITIVE_INFINITY;
	const busiest30Days = densestEventWindow(prs, 24 * 30).count;

	const isFast =
		perWeek >= CONFIG.PRS_SPAM_DENSITY_PER_WEEK ||
		busiest30Days >= CONFIG.PRS_SPAM_ROLLING_30DAYS;
	if (!isFast) {
		return [];
	}

	return [
		{
			id: "pr-distributed",
			points: CONFIG.POINTS_PR_SPAM_DISTRIBUTED,
			group: "pr-volume",
			amplifiable: true,
			facts: {
				prs: prs.length,
				repos: repos.size,
				perWeek: weeks > 0 ? perWeek : 0,
				busiest30Days,
			},
			events: prs,
		},
	];
}

export function detectExtremeAndDistributedPRSpam(
	events: ActivityEvent[],
): Flag[] {
	if (events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return [];
	}

	const prs = events.filter(isOpenedPR);
	const bursts = detectPRBursts(prs);

	// A burst already explains the volume, so the slower check would only repeat it.
	if (bursts.length > 0) {
		return bursts;
	}

	return detectDistributedPRs(prs);
}
