import dayjs from "dayjs";
import minMax from "dayjs/plugin/minMax";
import { CONFIG } from "../config";
import type { GitHubEvent, IdentifyFlag } from "../types";
import { densestEventWindow, type RampAnchor, rampPoints } from "../utils";

dayjs.extend(minMax);

const PR_WEEK_RAMP: readonly RampAnchor[] = [
	[CONFIG.PRS_WEEK_VERY_HIGH, CONFIG.POINTS_PRS_WEEK_VERY_HIGH],
	[CONFIG.PRS_WEEK_EXTREME, CONFIG.POINTS_PRS_WEEK_EXTREME],
];

export function detectExtremeAndDistributedPRSpam(
	events: GitHubEvent[],
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	// High-volume PR detection - TIME-WINDOWED (applies to all accounts)
	// Intensity/velocity is the signal, not total count
	if (events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return flags;
	}

	const allPREvents = events.filter(
		(e) => e.type === "PullRequestEvent" && e.payload?.action === "opened",
	);

	// The busiest 24 hours and 7 days anywhere in the data, not the last 24 hours
	// or last 7 days before today
	const dayWindow = densestEventWindow(allPREvents, 24);
	const weekWindow = densestEventWindow(allPREvents, 24 * 7);

	// Very high daily PR volume: 30+ PRs in 24 hours
	if (dayWindow.count >= CONFIG.PRS_DAY_EXTREME) {
		flags.push({
			label: "Very high PR volume (daily)",
			points: CONFIG.POINTS_PRS_DAY_EXTREME,
			group: "pr-volume",
			amplifiable: true,
			detail: `${dayWindow.count} PRs within a single 24-hour window`,
			data: [
				{
					label: "PRs in densest 24h window",
					value: dayWindow.count,
					threshold: CONFIG.PRS_DAY_EXTREME,
				},
			],
			events: dayWindow.items,
		});
	}

	// Very high weekly PR volume: 100+ PRs in 7 days
	if (weekWindow.count >= CONFIG.PRS_WEEK_EXTREME) {
		flags.push({
			label: "Very high PR volume (weekly)",
			points: rampPoints(weekWindow.count, PR_WEEK_RAMP),
			group: "pr-volume",
			amplifiable: true,
			detail: `${weekWindow.count} PRs within a single 7-day window`,
			data: [
				{
					label: "PRs in densest 7-day window",
					value: weekWindow.count,
					threshold: CONFIG.PRS_WEEK_EXTREME,
				},
			],
			events: weekWindow.items,
		});
	}
	// High weekly PR volume: 50+ PRs in 7 days (only if not already extreme)
	else if (weekWindow.count >= CONFIG.PRS_WEEK_VERY_HIGH) {
		flags.push({
			label: "High PR volume (weekly)",
			points: rampPoints(weekWindow.count, PR_WEEK_RAMP),
			group: "pr-volume",
			amplifiable: true,
			detail: `${weekWindow.count} PRs within a single 7-day window`,
			data: [
				{
					label: "PRs in densest 7-day window",
					value: weekWindow.count,
					threshold: CONFIG.PRS_WEEK_VERY_HIGH,
				},
			],
			events: weekWindow.items,
		});
	}

	// Distributed PR pattern: high PR count across many repos
	// Only check if not already flagged by time-based detection
	if (allPREvents.length >= CONFIG.PRS_SPAM_VOLUME) {
		const hasTimeBasedFlag = flags.some(
			(f) =>
				f.label === "Very high PR volume (daily)" ||
				f.label === "Very high PR volume (weekly)" ||
				f.label === "High PR volume (weekly)",
		);

		if (!hasTimeBasedFlag) {
			// Count distinct repos targeted by PRs
			const prTargetRepos = new Set(
				allPREvents
					.map((e) => e.repo?.name)
					.filter((name) => name !== undefined),
			);

			if (prTargetRepos.size >= CONFIG.REPOS_SPAM_SPREAD) {
				// Guard against flagging long-term contributors:
				// Calculate time density and rolling window
				const prTimestamps = allPREvents
					.map((e) => dayjs(e.created_at))
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
						label: "Distributed PR pattern",
						points: CONFIG.POINTS_PR_SPAM_DISTRIBUTED,
						group: "pr-volume",
						amplifiable: true,
						detail: `${allPREvents.length} PRs spread across ${prTargetRepos.size} different repositories${timeSpanDays > 0 ? ` (${prsPerWeek.toFixed(1)} PRs/week)` : ""}`,
						data: [
							{
								label: "Total PRs",
								value: allPREvents.length,
								threshold: CONFIG.PRS_SPAM_VOLUME,
							},
							{
								label: "Distinct repos targeted",
								value: prTargetRepos.size,
								threshold: CONFIG.REPOS_SPAM_SPREAD,
							},
							{
								label: "PRs per week",
								value:
									timeSpanWeeks > 0 ? parseFloat(prsPerWeek.toFixed(1)) : 0,
							},
							{
								label: "PRs in densest 30-day window",
								value: prsInLast30Days,
							},
						],
						events: allPREvents,
					});
				}
			}
		}
	}

	return flags;
}
