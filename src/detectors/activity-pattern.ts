import dayjs from "dayjs";
import { CONFIG } from "../config.ts";
import type { GitHubEvent, IdentifyFlag } from "../types.ts";

type RestWindow = {
	start: dayjs.Dayjs;
	end: dayjs.Dayjs;
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
	events: GitHubEvent[],
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	if (events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return flags;
	}

	const times = events
		.map((event) => ({ event, time: dayjs(event.created_at) }))
		.filter((entry) => entry.time.isValid())
		.sort((a, b) => a.time.valueOf() - b.time.valueOf());

	if (times.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return flags;
	}

	const timeline = times.map((entry) => entry.time);
	let worst: RestWindow | null = null;

	for (let start = 0; start < timeline.length; start++) {
		const windowStart = timeline[start];
		if (!windowStart) continue;
		const windowEnd = windowStart.add(24, "hour");

		let end = start;
		while (end < timeline.length) {
			if (!timeline[end]?.isBefore(windowEnd)) break;
			end++;
		}

		const eventCount = end - start;
		if (eventCount < CONFIG.MIN_EVENTS_FOR_ANALYSIS) continue;

		// Count busy hours from the start of the window, not from midnight.
		const activeSlots = new Set<number>();
		let maxGap = 0;
		let previous = windowStart;

		for (let i = start; i < end; i++) {
			const time = timeline[i];
			if (!time) continue;
			activeSlots.add(Math.floor(time.diff(windowStart, "hour", true)));
			const gap = time.diff(previous, "hour", true);
			if (gap > maxGap) maxGap = gap;
			previous = time;
		}

		// The quiet time after the last event is rest too.
		const trailingGap = windowEnd.diff(previous, "hour", true);
		if (trailingGap > maxGap) maxGap = trailingGap;

		const hoursActive = activeSlots.size;
		if (hoursActive < CONFIG.HOURS_ACTIVE_EXTREME) continue;
		if (eventCount / hoursActive < CONFIG.EVENTS_PER_HOUR_MIN) continue;

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
		.filter(
			(entry) =>
				!entry.time.isBefore(windowStart) && entry.time.isBefore(windowEnd),
		)
		.map((entry) => entry.event);

	const restLabel = worst.restGap.toFixed(1);

	flags.push({
		label: "24/7 activity pattern",
		points,
		group: "timing",
		amplifiable: true,
		detail: `Active in ${worst.hoursActive} of 24 hours, with the longest break being only ${restLabel} hours`,
		data: [
			{ label: "Window start", value: windowStart.toISOString() },
			{
				label: "Hours active",
				value: worst.hoursActive,
				threshold: CONFIG.HOURS_ACTIVE_EXTREME,
			},
			{
				label: "Longest rest (hours)",
				value: parseFloat(restLabel),
				threshold: CONFIG.REST_GAP_MIN_HOURS,
			},
			{ label: "Events in window", value: worst.eventCount },
		],
		events: windowEvents,
	});

	return flags;
}
