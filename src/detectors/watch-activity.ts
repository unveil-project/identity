import dayjs from "dayjs";
import { CONFIG } from "../config";
import type { IdentifyEvent, IdentifyFlag } from "../types";
import { minutesBetween, type RampAnchor, rampPoints } from "../utils";

const WATCH_RAMP: readonly RampAnchor[] = [
	[CONFIG.WATCH_SPAM_REPOS_HIGH, CONFIG.POINTS_WATCH_SPAM_HIGH],
	[CONFIG.WATCH_SPAM_REPOS_EXTREME, CONFIG.POINTS_WATCH_SPAM_EXTREME],
];

export function detectWatchActivity(events: IdentifyEvent[]): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	const watchEvents = events.filter((e) => e.type === "star");

	if (watchEvents.length < CONFIG.WATCH_SPAM_MIN_EVENTS) {
		return flags;
	}

	const watchTimestamps = watchEvents
		.map((e) => ({ event: e, time: dayjs(e.at) }))
		.sort((a, b) => a.time.valueOf() - b.time.valueOf());

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

		while (
			watchTimestamps[windowStartIdx] &&
			windowEnd &&
			windowEnd.diff(watchTimestamps[windowStartIdx].time, "hour", true) >
				CONFIG.WATCH_SPAM_WINDOW_HOURS
		) {
			windowStartIdx++;
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
