import { CONFIG } from "../config";
import { type TimedEvent, toTimeline } from "../events";
import { addHours, hoursBetween, toISO } from "../time";
import type { ActivityEvent, Flag } from "../types";

type ActiveDay = {
	start: number;
	end: number;
	/** How many of the 24 hours had at least one event. */
	hoursActive: number;
	/** The longest quiet stretch, in hours. */
	longestRest: number;
	events: ActivityEvent[];
};

/** Measure the 24 hours that start with the event at `startIndex`. */
function measureDay(timeline: TimedEvent[], startIndex: number): ActiveDay {
	const start = timeline[startIndex]?.time ?? 0;
	const end = addHours(start, 24);

	const dayEntries: TimedEvent[] = [];
	for (let i = startIndex; i < timeline.length; i++) {
		const entry = timeline[i];
		if (!entry || entry.time >= end) {
			break;
		}

		dayEntries.push(entry);
	}

	// Busy hours count from the start of the window, not from midnight.
	const activeHours = new Set(
		dayEntries.map((entry) => Math.floor(hoursBetween(start, entry.time))),
	);

	// The quiet time after the last event is rest too, so the window end
	// closes the last gap.
	const times = [...dayEntries.map((entry) => entry.time), end];
	let longestRest = 0;
	for (let i = 1; i < times.length; i++) {
		const gap = hoursBetween(times[i - 1] ?? start, times[i] ?? end);
		longestRest = Math.max(longestRest, gap);
	}

	return {
		start,
		end,
		hoursActive: activeHours.size,
		longestRest,
		events: dayEntries.map((entry) => entry.event),
	};
}

/** Busy in nearly every hour, with several events in each of them. */
function isBusyAllDay(day: ActiveDay): boolean {
	if (day.events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return false;
	}

	if (day.hoursActive < CONFIG.HOURS_ACTIVE_EXTREME) {
		return false;
	}

	return day.events.length / day.hoursActive >= CONFIG.EVENTS_PER_HOUR_MIN;
}

/**
 * Find any 24 hours where the account never stopped long enough to sleep.
 *
 * We slide a 24 hour window over the events instead of looking at each calendar
 * day. Calendar days depend on the timezone, so a busy night that runs over
 * midnight would be split in two and we would miss it.
 */
export function detectInhumanActivityPattern(events: ActivityEvent[]): Flag[] {
	const timeline = toTimeline(events);

	if (timeline.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return [];
	}

	let leastRested: ActiveDay | undefined;

	for (let start = 0; start < timeline.length; start++) {
		const day = measureDay(timeline, start);

		if (!isBusyAllDay(day)) {
			continue;
		}

		if (!leastRested || day.longestRest < leastRested.longestRest) {
			leastRested = day;
		}
	}

	if (!leastRested || leastRested.longestRest >= CONFIG.REST_GAP_MIN_HOURS) {
		return [];
	}

	const points =
		leastRested.longestRest < CONFIG.REST_GAP_NONE_HOURS
			? CONFIG.POINTS_24_7_NO_REST
			: CONFIG.POINTS_24_7_ACTIVITY;

	return [
		{
			id: "always-active",
			points,
			group: "timing",
			amplifiable: true,
			facts: {
				windowStart: toISO(leastRested.start),
				hoursActive: leastRested.hoursActive,
				longestRestHours: leastRested.longestRest,
				events: leastRested.events.length,
			},
			events: leastRested.events,
		},
	];
}
