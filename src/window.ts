import { eventTime } from "./events";
import { daysBetween, timeRange, toISO } from "./time";
import type { ActivityEvent, WindowInfo } from "./types";

/**
 * Describe the list of events we look at.
 *
 * `saturated` is true when the platform gave us as many events as it ever gives
 * (`eventCap`). When that happens, the account did more than we can see, so any
 * count we make from this list is a minimum, not the real number.
 *
 * `ignoredEventCount` is how many events we were given but left out. They still
 * count toward `saturated`, because the platform did return them.
 */
export function analyzeWindow(
	events: readonly ActivityEvent[],
	eventCap?: number,
	ignoredEventCount = 0,
): WindowInfo {
	const range = timeRange(events.map(eventTime));
	const receivedCount = events.length + ignoredEventCount;
	const saturated = eventCap !== undefined && receivedCount >= eventCap;

	if (!range) {
		return {
			eventCount: events.length,
			spanDays: 0,
			firstEventAt: null,
			lastEventAt: null,
			saturated,
			ignoredEventCount,
		};
	}

	return {
		eventCount: events.length,
		spanDays: daysBetween(range.start, range.end),
		firstEventAt: toISO(range.start),
		lastEventAt: toISO(range.end),
		saturated,
		ignoredEventCount,
	};
}
