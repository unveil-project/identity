import { CONFIG } from "../config";
import { hoursBetween, minutesBetween, toTime } from "../time";
import type { ActivityEvent, Flag } from "../types";
import { type RampAnchor, rampPoints } from "../utils";

const WATCH_RAMP: readonly RampAnchor[] = [
	[CONFIG.WATCH_SPAM_REPOS_HIGH, CONFIG.POINTS_WATCH_SPAM_HIGH],
	[CONFIG.WATCH_SPAM_REPOS_EXTREME, CONFIG.POINTS_WATCH_SPAM_EXTREME],
];

export function detectWatchActivity(events: ActivityEvent[]): Flag[] {
	const flags: Flag[] = [];

	const watchEvents = events.filter((e) => e.type === "star");

	if (watchEvents.length < CONFIG.WATCH_SPAM_MIN_EVENTS) {
		return flags;
	}

	const watchTimestamps = watchEvents
		.map((e) => ({ event: e, time: toTime(e.at) }))
		.sort((a, b) => a.time - b.time);

	let maxReposInWindow = 0;
	let maxWindowStartIdx = 0;
	let maxWindowEndIdx = 0;
	let windowStartIdx = 0;

	for (
		let windowEndIdx = 0;
		windowEndIdx < watchTimestamps.length;
		windowEndIdx++
	) {
		const windowEnd = watchTimestamps[windowEndIdx]?.time;
		let windowStart = watchTimestamps[windowStartIdx]?.time;

		while (
			windowStart !== undefined &&
			windowEnd &&
			hoursBetween(windowStart, windowEnd) > CONFIG.WATCH_SPAM_WINDOW_HOURS
		) {
			windowStartIdx++;
			windowStart = watchTimestamps[windowStartIdx]?.time;
		}

		const reposInWindow = new Set(
			watchTimestamps
				.slice(windowStartIdx, windowEndIdx + 1)
				.map((item) => item.event.repo),
		);

		if (reposInWindow.size > maxReposInWindow) {
			maxReposInWindow = reposInWindow.size;
			maxWindowStartIdx = windowStartIdx;
			maxWindowEndIdx = windowEndIdx;
		}
	}

	if (maxReposInWindow < CONFIG.WATCH_SPAM_REPOS_HIGH) {
		return flags;
	}

	const windowStart = watchTimestamps[maxWindowStartIdx]?.time;
	const windowEnd = watchTimestamps[maxWindowEndIdx]?.time;

	if (windowStart === undefined || windowEnd === undefined) {
		return flags;
	}

	const windowMinutes = minutesBetween(windowStart, windowEnd);

	const windowEvents = watchTimestamps
		.slice(maxWindowStartIdx, maxWindowEndIdx + 1)
		.map((item) => item.event);

	const watchPoints = rampPoints(maxReposInWindow, WATCH_RAMP);

	if (maxReposInWindow >= CONFIG.WATCH_SPAM_REPOS_EXTREME) {
		flags.push({
			id: "star-spray-extreme",
			points: watchPoints,
			group: "watch",
			amplifiable: true,
			facts: {
				repos: maxReposInWindow,
				windowMinutes,
				totalStars: watchEvents.length,
			},
			events: windowEvents,
		});
	} else {
		flags.push({
			id: "star-spray-high",
			points: watchPoints,
			group: "watch",
			amplifiable: true,
			facts: {
				repos: maxReposInWindow,
				windowMinutes,
				totalStars: watchEvents.length,
			},
			events: windowEvents,
		});
	}

	return flags;
}
