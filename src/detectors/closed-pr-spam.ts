import dayjs from "dayjs";
import { CONFIG } from "../config";
import { localDay } from "../timezone";
import type { GitHubEvent, IdentifyFlag } from "../types";
import { type RampAnchor, rampPoints } from "../utils";

const CLOSED_PR_RAMP: readonly RampAnchor[] = [
	[CONFIG.CLOSED_PR_SPAM_MIN, CONFIG.POINTS_CLOSED_PR_SPAM],
	[CONFIG.CLOSED_PR_VOLUME_HIGH, CONFIG.POINTS_CLOSED_PR_SPAM_HIGH],
	[CONFIG.CLOSED_PR_VOLUME_EXTREME, CONFIG.POINTS_CLOSED_PR_SPAM_EXTREME],
];

export function detectClosedPRSpam(
	events: GitHubEvent[],
	isEstablished: boolean,
	accountName: string,
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

	const accountNameLower = accountName.toLowerCase();

	const closedPREvents = events.filter((e) => {
		if (e.type !== "PullRequestEvent" || e.payload?.action !== "closed")
			return false;
		// Only count PRs the user submitted (head branch from their fork).
		// Excludes maintainer activity where the user closes other people's PRs.
		const headUrl =
			e.payload?.pull_request?.head?.repo?.url?.toLowerCase() ?? "";
		return headUrl.includes(`/repos/${accountNameLower}/`);
	});

	if (closedPREvents.length < minClosedPRs) {
		return flags;
	}

	// Count distinct repos targeted by closed PRs
	const closedPRRepos = new Set<string>(
		closedPREvents
			.map((e) => e.repo?.name)
			.filter((name) => name !== undefined),
	);

	// Calculate overall time span of closed PR activity
	const closedPRTimestamps = closedPREvents.map((e) => dayjs(e.created_at));
	const earliestClosed = closedPRTimestamps.reduce((min, ts) =>
		ts.isBefore(min) ? ts : min,
	);
	const latestClosed = closedPRTimestamps.reduce((max, ts) =>
		ts.isAfter(max) ? ts : max,
	);
	const timeSpanMinutes = latestClosed.diff(earliestClosed, "minute");
	const timeSpanDays = latestClosed.diff(earliestClosed, "day");
	const fractionalDays = latestClosed.diff(earliestClosed, "day", true);
	const timeRangeStr =
		timeSpanDays > 0
			? `${timeSpanDays}d`
			: `${Math.max(1, Math.ceil(timeSpanMinutes / 60))}h`;

	// Find days with a lot of closed PRs. Days use the account's own local time.
	const prsByDay = new Map<string, number>();
	closedPREvents.forEach((e) => {
		if (!e.created_at) {
			return;
		}

		const day = localDay(e.created_at, tzOffsetHours);
		prsByDay.set(day, (prsByDay.get(day) || 0) + 1);
	});

	// Identify all days with significant activity (>= 10 PRs threshold)
	const burstDays = Array.from(prsByDay.entries())
		.filter(([_, count]) => count >= 10)
		.sort((a, b) => b[1] - a[1])
		.map(([_, count]) => count);

	// Format burst details for human-readable output
	let burstStr = "";
	if (burstDays.length > 0) {
		if (burstDays.length === 1) {
			burstStr = `, with a spike of ${burstDays[0]} closures on one day`;
		} else {
			const burstList =
				burstDays.slice(0, -1).join(", ") +
				` and ${burstDays[burstDays.length - 1]}`;
			burstStr = `, with spike days of ${burstList} closures each`;
		}
	}

	const points = rampPoints(closedPREvents.length, CLOSED_PR_RAMP);

	// Pattern 1: Spray scatter - closed PRs across many repos at significant density
	const prDensity =
		fractionalDays > 0
			? closedPREvents.length / fractionalDays
			: closedPREvents.length;
	const highDensity = prDensity >= CONFIG.CLOSED_PR_MIN_DENSITY;

	if (closedPRRepos.size >= CONFIG.CLOSED_PR_REPO_SPREAD && highDensity) {
		flags.push({
			label: "Closed PRs across many repositories",
			points,
			group: "pr-outcome",
			amplifiable: true,
			detail: `${closedPREvents.length} PRs were closed across ${closedPRRepos.size} repositories in ${timeRangeStr}${burstStr}.`,
			data: [
				{
					label: "Closed PRs",
					value: closedPREvents.length,
					threshold: minClosedPRs,
				},
				{
					label: "Distinct repos",
					value: closedPRRepos.size,
					threshold: CONFIG.CLOSED_PR_REPO_SPREAD,
				},
				{ label: "Time span", value: timeRangeStr },
				{ label: "Density (PRs/day)", value: parseFloat(prDensity.toFixed(1)) },
			],
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
				label: "Concentrated PR closures",
				points: burstPoints,
				group: "pr-outcome",
				amplifiable: true,
				detail: `${closedPREvents.length} PRs closed across ${closedPRRepos.size} repos in ${timeSpanMinutes}m (concentrated closing activity)`,
				data: [
					{
						label: "Closed PRs",
						value: closedPREvents.length,
						threshold: minClosedPRs,
					},
					{ label: "Distinct repos", value: closedPRRepos.size },
					{
						label: "Time span (min)",
						value: timeSpanMinutes,
						threshold: CONFIG.CLOSED_PR_TIME_WINDOW_MINUTES,
					},
				],
				events: closedPREvents,
			});
		}
	}

	return flags;
}
