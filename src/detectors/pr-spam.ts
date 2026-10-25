import dayjs from "dayjs";
import minMax from "dayjs/plugin/minMax";
import { CONFIG } from "../config";
import type { IdentifyEvent, IdentifyFlag } from "../types";
import { densestEventWindow, type RampAnchor, rampPoints } from "../utils";

dayjs.extend(minMax);

const PR_WEEK_RAMP: readonly RampAnchor[] = [
	[CONFIG.PRS_WEEK_VERY_HIGH, CONFIG.POINTS_PRS_WEEK_VERY_HIGH],
	[CONFIG.PRS_WEEK_EXTREME, CONFIG.POINTS_PRS_WEEK_EXTREME],
];

export function detectExtremeAndDistributedPRSpam(
	events: IdentifyEvent[],
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	// High-volume PR detection - TIME-WINDOWED (applies to all accounts)
	// Intensity/velocity is the signal, not total count
	if (events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return flags;
	}

	const allPREvents = events.filter(
		(e) => e.type === "pull-request" && e.action === "opened",
	);

	// The busiest 24 hours and 7 days anywhere in the data, not the last 24 hours
	// or last 7 days before today
	const dayWindow = densestEventWindow(allPREvents, 24);
	const weekWindow = densestEventWindow(allPREvents, 24 * 7);

	// Very high daily PR volume: 30+ PRs in 24 hours
	if (dayWindow.count >= CONFIG.PRS_DAY_EXTREME) {
		flags.push({
			id: "pr-volume-day",
			points: CONFIG.POINTS_PRS_DAY_EXTREME,
			group: "pr-volume",
			amplifiable: true,
			facts: { prs: dayWindow.count },
			events: dayWindow.items,
		});
	}

	// Very high weekly PR volume: 100+ PRs in 7 days
	if (weekWindow.count >= CONFIG.PRS_WEEK_EXTREME) {
		flags.push({
			id: "pr-volume-week-extreme",
			points: rampPoints(weekWindow.count, PR_WEEK_RAMP),
			group: "pr-volume",
			amplifiable: true,
			facts: { prs: weekWindow.count },
			events: weekWindow.items,
		});
	}
	// High weekly PR volume: 50+ PRs in 7 days (only if not already extreme)
	else if (weekWindow.count >= CONFIG.PRS_WEEK_VERY_HIGH) {
		flags.push({
			id: "pr-volume-week-high",
			points: rampPoints(weekWindow.count, PR_WEEK_RAMP),
			group: "pr-volume",
			amplifiable: true,
			facts: { prs: weekWindow.count },
			events: weekWindow.items,
		});
	}

	// Distributed PR pattern: high PR count across many repos
	// Only check if not already flagged by time-based detection
	if (allPREvents.length >= CONFIG.PRS_SPAM_VOLUME) {
		const hasTimeBasedFlag = flags.some(
			(f) =>
				f.id === "pr-volume-day" ||
				f.id === "pr-volume-week-extreme" ||
				f.id === "pr-volume-week-high",
		);

		if (!hasTimeBasedFlag) {
			// Count distinct repos targeted by PRs
			const prTargetRepos = new Set(allPREvents.map((e) => e.repo));

			if (prTargetRepos.size >= CONFIG.REPOS_SPAM_SPREAD) {
				// Guard against flagging long-term contributors:
				// Calculate time density and rolling window
				const prTimestamps = allPREvents
					.map((e) => dayjs(e.at))
					.sort((a, b) => a.valueOf() - b.valueOf());

				const earliestPR = prTimestamps[0];
				const latestPR = prTimestamps[prTimestamps.length - 1];
				const timeSpanDays = latestPR
					? latestPR.diff(earliestPR, "days", true)
					: 0;
				const timeSpanWeeks = timeSpanDays / 7;

				// Calculate density: PRs per week
				const prsPerWeek =
					timeSpanWeeks > 0 ? allPREvents.length / timeSpanWeeks : Infinity;

				const prsInLast30Days = densestEventWindow(allPREvents, 24 * 30).count;

				// Flag if either:
				// 1. High density (PRs per week exceeds threshold), OR
				// 2. Rolling 30-day window has excessive volume
				const isHighDensity = prsPerWeek >= CONFIG.PRS_SPAM_DENSITY_PER_WEEK;
				const isRolling30DaySpam =
					prsInLast30Days >= CONFIG.PRS_SPAM_ROLLING_30DAYS;

				if (isHighDensity || isRolling30DaySpam) {
					flags.push({
						id: "pr-distributed",
						points: CONFIG.POINTS_PR_SPAM_DISTRIBUTED,
						group: "pr-volume",
						amplifiable: true,
						facts: {
							prs: allPREvents.length,
							repos: prTargetRepos.size,
							perWeek: timeSpanWeeks > 0 ? prsPerWeek : 0,
							busiest30Days: prsInLast30Days,
						},
						events: allPREvents,
					});
				}
			}
		}
	}

	return flags;
}
