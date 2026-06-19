import dayjs from "dayjs";
import { CONFIG } from "../config";
import type { GitHubEvent, IdentifyFlag } from "../types";

export function detectWatchActivity(events: GitHubEvent[]): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	const watchEvents = events.filter((e) => e.type === "WatchEvent");

	if (watchEvents.length < CONFIG.WATCH_SPAM_MIN_EVENTS) {
		return flags;
	}

	const watchTimestamps = watchEvents
		.map((e) => ({ event: e, time: dayjs(e.created_at) }))
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
			windowEnd.diff(
				watchTimestamps[windowStartIdx].time,
				"hour",
				true,
			) > CONFIG.WATCH_SPAM_WINDOW_HOURS
		) {
			windowStartIdx++;
		}

		const reposInWindow = new Set(
			watchTimestamps
				.slice(windowStartIdx, windowEndIdx + 1)
				.map((item) => item.event.repo?.name)
				.filter((name) => name !== undefined),
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
	const hoursSpan =
		windowEnd && windowStart
			? Math.round(windowEnd.diff(windowStart, "hour", true))
			: 0;

	if (maxReposInWindow >= CONFIG.WATCH_SPAM_REPOS_EXTREME) {
		flags.push({
			label: "Very high starring rate",
			points: CONFIG.POINTS_WATCH_SPAM_EXTREME,
			amplifiable: true,
			detail: `${maxReposInWindow} repositories starred within ${hoursSpan} hour${hoursSpan === 1 ? "" : "s"}`,
		});
	} else {
		flags.push({
			label: "High starring rate",
			points: CONFIG.POINTS_WATCH_SPAM_HIGH,
			amplifiable: true,
			detail: `${maxReposInWindow} repositories starred within ${hoursSpan} hour${hoursSpan === 1 ? "" : "s"}`,
		});
	}

	return flags;
}
