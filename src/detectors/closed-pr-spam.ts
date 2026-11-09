import { CONFIG } from "../config";
import { eventTime } from "../events";
import { spanDays, spanMinutes } from "../time";
import { localDay } from "../timezone";
import type { ActivityEvent, Flag } from "../types";
import { countBy, type RampAnchor, rampPoints } from "../utils";

const CLOSED_PR_RAMP: readonly RampAnchor[] = [
	[CONFIG.CLOSED_PR_SPAM_MIN, CONFIG.POINTS_CLOSED_PR_SPAM],
	[CONFIG.CLOSED_PR_VOLUME_HIGH, CONFIG.POINTS_CLOSED_PR_SPAM_HIGH],
	[CONFIG.CLOSED_PR_VOLUME_EXTREME, CONFIG.POINTS_CLOSED_PR_SPAM_EXTREME],
];

/**
 * A PR the account wrote that was closed without a merge. Closing other
 * people's PRs is maintainer work and does not count.
 */
function isOwnClosedPR(event: ActivityEvent): boolean {
	return (
		event.type === "pull-request" &&
		event.action === "closed" &&
		event.pullRequest?.isAuthor === true
	);
}

/** How many PRs were closed on each busy day, in local time, busiest first. */
function spikeDaysOf(closed: ActivityEvent[], tzOffsetHours: number): number[] {
	const closedPerDay = countBy(closed, (event) =>
		localDay(event.at, tzOffsetHours),
	);
	closedPerDay.delete("");

	return [...closedPerDay.values()]
		.filter((count) => count >= CONFIG.CLOSED_PR_SPIKE_DAY_MIN)
		.sort((a, b) => b - a);
}

/**
 * Many closed PRs, either scattered over several repositories at a steady
 * pace, or all closed within an hour.
 */
export function detectClosedPRSpam(
	events: ActivityEvent[],
	isEstablished: boolean,
	tzOffsetHours = 0,
): Flag[] {
	const minClosed = isEstablished
		? CONFIG.CLOSED_PR_SPAM_MIN_ESTABLISHED
		: CONFIG.CLOSED_PR_SPAM_MIN;

	const closed = events.filter(isOwnClosedPR);
	if (closed.length < minClosed) {
		return [];
	}

	const repos = new Set(closed.map((event) => event.repo));
	const days = spanDays(closed.map(eventTime));
	const minutes = Math.trunc(spanMinutes(closed.map(eventTime)));
	const perDay = days > 0 ? closed.length / days : closed.length;
	const points = rampPoints(closed.length, CLOSED_PR_RAMP);

	const isSpray =
		repos.size >= CONFIG.CLOSED_PR_REPO_SPREAD &&
		perDay >= CONFIG.CLOSED_PR_MIN_DENSITY;

	if (isSpray) {
		return [
			{
				id: "closed-pr-spray",
				points,
				group: "pr-outcome",
				amplifiable: true,
				facts: {
					closed: closed.length,
					minClosed,
					repos: repos.size,
					spanDays: Math.trunc(days),
					spanMinutes: minutes,
					spikeDays: spikeDaysOf(closed, tzOffsetHours),
					perDay,
				},
				events: closed,
			},
		];
	}

	const isBurst =
		repos.size >= CONFIG.CLOSED_PR_BURST_MIN_REPOS &&
		minutes <= CONFIG.CLOSED_PR_TIME_WINDOW_MINUTES;

	if (!isBurst) {
		return [];
	}

	let burstPoints = points;
	if (closed.length >= CONFIG.CLOSED_PR_VOLUME_EXTREME) {
		burstPoints = CONFIG.POINTS_CLOSED_PR_SPAM_BURST_EXTREME;
	}

	return [
		{
			id: "closed-pr-burst",
			points: burstPoints,
			group: "pr-outcome",
			amplifiable: true,
			facts: {
				closed: closed.length,
				minClosed,
				repos: repos.size,
				spanMinutes: minutes,
			},
			events: closed,
		},
	];
}
