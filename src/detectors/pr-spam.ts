import dayjs from "dayjs";
import minMax from "dayjs/plugin/minMax";
import { CONFIG } from "../config";
import type { GitHubEvent, IdentifyFlag } from "../types";

dayjs.extend(minMax);

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

	// Anchor time windows to latest PR in batch for reproducible, stable results
	const prTimestamps = allPREvents.map((e) => dayjs(e.created_at));
	const latestPRTime = dayjs.max(prTimestamps) || dayjs();
	const now = latestPRTime;
	const oneDayAgo = now.subtract(1, "day");
	const oneWeekAgo = now.subtract(1, "week");

	// Count PRs in different time windows
	const prsInLastDay = allPREvents.filter((e) =>
		dayjs(e.created_at).isAfter(oneDayAgo),
	);
	const prsInLastWeek = allPREvents.filter((e) =>
		dayjs(e.created_at).isAfter(oneWeekAgo),
	);

	// Very high daily PR volume: 30+ PRs in 24 hours
	if (prsInLastDay.length >= CONFIG.PRS_DAY_EXTREME) {
		flags.push({
			label: "Very high PR volume (daily)",
			points: CONFIG.POINTS_PRS_DAY_EXTREME,
			amplifiable: true,
			detail: `${prsInLastDay.length} PRs in the last 24 hours`,
			data: [
				{
					label: "PRs in last 24h",
					value: prsInLastDay.length,
					threshold: CONFIG.PRS_DAY_EXTREME,
				},
			],
			events: prsInLastDay,
		});
	}

	// Very high weekly PR volume: 100+ PRs in 7 days
	if (prsInLastWeek.length >= CONFIG.PRS_WEEK_EXTREME) {
		flags.push({
			label: "Very high PR volume (weekly)",
			points: CONFIG.POINTS_PRS_WEEK_EXTREME,
			amplifiable: true,
			detail: `${prsInLastWeek.length} PRs in the last 7 days`,
			data: [
				{
					label: "PRs in last 7 days",
					value: prsInLastWeek.length,
					threshold: CONFIG.PRS_WEEK_EXTREME,
				},
			],
			events: prsInLastWeek,
		});
	}
	// High weekly PR volume: 50+ PRs in 7 days (only if not already extreme)
	else if (prsInLastWeek.length >= CONFIG.PRS_WEEK_VERY_HIGH) {
		flags.push({
			label: "High PR volume (weekly)",
			points: CONFIG.POINTS_PRS_WEEK_VERY_HIGH,
			amplifiable: true,
			detail: `${prsInLastWeek.length} PRs in the last 7 days`,
			data: [
				{
					label: "PRs in last 7 days",
					value: prsInLastWeek.length,
					threshold: CONFIG.PRS_WEEK_VERY_HIGH,
				},
			],
			events: prsInLastWeek,
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

				// Check rolling 30-day window
				const thirtyDaysAgo = now.subtract(30, "days");
				const prsInLast30Days = allPREvents.filter((e) =>
					dayjs(e.created_at).isAfter(thirtyDaysAgo),
				).length;

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
								value: parseFloat(prsPerWeek.toFixed(1)),
							},
							{ label: "PRs in last 30 days", value: prsInLast30Days },
						],
						events: allPREvents,
					});
				}
			}
		}
	}

	return flags;
}
