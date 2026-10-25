import { CONFIG } from "../config";
import { addHours, hoursBetween, isValidTime, toISO, toTime } from "../time";
import type { IdentifyEvent, IdentifyFlag } from "../types";

type RestWindow = {
	start: number;
	end: number;
	hoursActive: number;
	restGap: number;
	eventCount: number;
};

/**
 * Find any 24 hours where the account never stopped long enough to sleep.
 *
 * We slide a 24 hour window over the events instead of looking at each calendar
 * day. Calendar days depend on the timezone, so a busy night that runs over
 * midnight would be split in two and we would miss it.
 */
export function detectInhumanActivityPattern(
	events: IdentifyEvent[],
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	if (events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return flags;
	}

	const times = events
		.map((event) => ({ event, time: toTime(event.at) }))
		.filter((entry) => isValidTime(entry.time))
		.sort((a, b) => a.time - b.time);

	if (times.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return flags;
	}

	const timeline = times.map((entry) => entry.time);
	let worst: RestWindow | null = null;

	for (let start = 0; start < timeline.length; start++) {
		const windowStart = timeline[start];
		if (!windowStart) {
			continue;
		}

		const windowEnd = addHours(windowStart, 24);

		let end = start;
		while (end < timeline.length && timeline[end] < windowEnd) {
			end++;
		}

		const eventCount = end - start;
		if (eventCount < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
			continue;
		}

		// Count busy hours from the start of the window, not from midnight.
		const activeSlots = new Set<number>();
		let maxGap = 0;
		let previous = windowStart;

		for (let i = start; i < end; i++) {
			const time = timeline[i];
			if (!time) {
				continue;
			}

			activeSlots.add(Math.floor(hoursBetween(windowStart, time)));
			const gap = hoursBetween(previous, time);
			if (gap > maxGap) {
				maxGap = gap;
			}

			previous = time;
		}

		// The quiet time after the last event is rest too.
		const trailingGap = hoursBetween(previous, windowEnd);
		if (trailingGap > maxGap) {
			maxGap = trailingGap;
		}

		const hoursActive = activeSlots.size;
		if (hoursActive < CONFIG.HOURS_ACTIVE_EXTREME) {
			continue;
		}

		if (eventCount / hoursActive < CONFIG.EVENTS_PER_HOUR_MIN) {
			continue;
		}

		if (!worst || maxGap < worst.restGap) {
			worst = {
				start: windowStart,
				end: windowEnd,
				hoursActive,
				restGap: maxGap,
				eventCount,
			};
		}
	}

	if (!worst || worst.restGap >= CONFIG.REST_GAP_MIN_HOURS) {
		return flags;
	}

	let points: number = CONFIG.POINTS_24_7_ACTIVITY;
	if (worst.restGap < 1) {
		points = Math.round(points * 1.5);
	}

	const windowStart = worst.start;
	const windowEnd = worst.end;
	const windowEvents = times
		.filter((entry) => entry.time >= windowStart && entry.time < windowEnd)
		.map((entry) => entry.event);

	flags.push({
		id: "always-active",
		points,
		group: "timing",
		amplifiable: true,
		facts: {
			windowStart: toISO(windowStart),
			hoursActive: worst.hoursActive,
			longestRestHours: worst.restGap,
			events: worst.eventCount,
		},
		events: windowEvents,
	});

	return flags;
}
