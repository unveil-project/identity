import { CONFIG } from "../config";
import { daysBetween, minutesBetween, toTime } from "../time";
import { localDay } from "../timezone";
import type { IdentifyEvent, IdentifyFlag } from "../types";
import { type RampAnchor, rampPoints } from "../utils";

const CLOSED_PR_RAMP: readonly RampAnchor[] = [
	[CONFIG.CLOSED_PR_SPAM_MIN, CONFIG.POINTS_CLOSED_PR_SPAM],
	[CONFIG.CLOSED_PR_VOLUME_HIGH, CONFIG.POINTS_CLOSED_PR_SPAM_HIGH],
	[CONFIG.CLOSED_PR_VOLUME_EXTREME, CONFIG.POINTS_CLOSED_PR_SPAM_EXTREME],
];

export function detectClosedPRSpam(
	events: IdentifyEvent[],
	isEstablished: boolean,
	tzOffsetHours = 0,
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	// Closed PR detection (closed contributions across many repos)
	// Pattern 1: Spray scatter - account closes PRs across many different repos
	//           Indicates: contributions being closed across a wide range of repositories
	// Pattern 2: Concentrated closing - many closed PRs to varied repos in short time
	//           Indicates: automated contribution pattern or concentrated closing activity
	const minClosedPRs = isEstablished
		? CONFIG.CLOSED_PR_SPAM_MIN_ESTABLISHED
		: CONFIG.CLOSED_PR_SPAM_MIN;

	// Only count PRs the user submitted. Excludes maintainer activity where the
	// user closes other people's PRs.
	const closedPREvents = events.filter(
		(e) =>
			e.type === "pull-request" &&
			e.action === "closed" &&
			e.pullRequest?.isAuthor === true,
	);

	if (closedPREvents.length < minClosedPRs) {
		return flags;
	}

	// Count distinct repos targeted by closed PRs
	const closedPRRepos = new Set<string>(closedPREvents.map((e) => e.repo));

	// Calculate overall time span of closed PR activity
	const closedPRTimestamps = closedPREvents.map((e) => toTime(e.at));
	const earliestClosed = Math.min(...closedPRTimestamps);
	const latestClosed = Math.max(...closedPRTimestamps);
	const timeSpanMinutes = Math.trunc(
		minutesBetween(earliestClosed, latestClosed),
	);
	const fractionalDays = daysBetween(earliestClosed, latestClosed);
	const timeSpanDays = Math.trunc(fractionalDays);

	// Find days with a lot of closed PRs. Days use the account's own local time.
	const prsByDay = new Map<string, number>();
	closedPREvents.forEach((e) => {
		if (!e.at) {
			return;
		}

		const day = localDay(e.at, tzOffsetHours);
		prsByDay.set(day, (prsByDay.get(day) || 0) + 1);
	});

	// Identify all days with significant activity (>= 10 PRs threshold)
	const burstDays = Array.from(prsByDay.entries())
		.filter(([_, count]) => count >= 10)
		.sort((a, b) => b[1] - a[1])
		.map(([_, count]) => count);

	const points = rampPoints(closedPREvents.length, CLOSED_PR_RAMP);

	// Pattern 1: Spray scatter - closed PRs across many repos at significant density
	const prDensity =
		fractionalDays > 0
			? closedPREvents.length / fractionalDays
			: closedPREvents.length;
	const highDensity = prDensity >= CONFIG.CLOSED_PR_MIN_DENSITY;

	if (closedPRRepos.size >= CONFIG.CLOSED_PR_REPO_SPREAD && highDensity) {
		flags.push({
			id: "closed-pr-spray",
			points,
			group: "pr-outcome",
			amplifiable: true,
			facts: {
				closed: closedPREvents.length,
				minClosed: minClosedPRs,
				repos: closedPRRepos.size,
				spanDays: timeSpanDays,
				spanMinutes: timeSpanMinutes,
				spikeDays: burstDays,
				perDay: prDensity,
			},
			events: closedPREvents,
		});

		return flags;
	}

	// Pattern 2: Concentrated closing to few repos in short window
	// (would be caught above if PRs are scattered, so this is secondary check)
	if (closedPRRepos.size >= 2) {
		if (timeSpanMinutes <= CONFIG.CLOSED_PR_TIME_WINDOW_MINUTES) {
			// For burst patterns with extreme volume, boost points even higher
			const burstPoints =
				closedPREvents.length >= CONFIG.CLOSED_PR_VOLUME_EXTREME
					? CONFIG.POINTS_CLOSED_PR_SPAM_BURST_EXTREME
					: points;

			flags.push({
				id: "closed-pr-burst",
				points: burstPoints,
				group: "pr-outcome",
				amplifiable: true,
				facts: {
					closed: closedPREvents.length,
					minClosed: minClosedPRs,
					repos: closedPRRepos.size,
					spanMinutes: timeSpanMinutes,
				},
				events: closedPREvents,
			});
		}
	}

	return flags;
}
