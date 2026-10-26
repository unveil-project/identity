import { daysBetween, isValidTime, toISO, toTime } from "./time";
import type { ActivityEvent, WindowInfo } from "./types";

/**
 * Describe the list of events we were given.
 *
 * `saturated` is true when the platform gave us as many events as it ever gives
 * (`eventCap`). When that happens, the account did more than we can see, so any
 * count we make from this list is a minimum, not the real number.
 */
export function analyzeWindow(
	events: readonly ActivityEvent[],
	eventCap?: number,
): WindowInfo {
	const times = events
		.map((event) => toTime(event.at))
		.filter(isValidTime)
		.sort((a, b) => a - b);

	const first = times[0];
	const last = times[times.length - 1];

	return {
		eventCount: events.length,
		spanDays: first && last ? daysBetween(first, last) : 0,
		firstEventAt: first ? toISO(first) : null,
		lastEventAt: last ? toISO(last) : null,
		saturated: eventCap !== undefined && events.length >= eventCap,
	};
}
