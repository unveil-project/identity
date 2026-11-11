import { eventTime } from "./events";
import { daysBetween, timeRange, toISO } from "./time";
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
	const range = timeRange(events.map(eventTime));
	const saturated = eventCap !== undefined && events.length >= eventCap;

	if (!range) {
		return {
			eventCount: events.length,
			spanDays: 0,
			firstEventAt: null,
			lastEventAt: null,
			saturated,
		};
	}

	return {
		eventCount: events.length,
		spanDays: daysBetween(range.start, range.end),
		firstEventAt: toISO(range.start),
		lastEventAt: toISO(range.end),
		saturated,
	};
}
