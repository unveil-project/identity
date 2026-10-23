import dayjs from "dayjs";
import type { IdentifyEvent, WindowInfo } from "./types";

/**
 * Describe the list of events we were given.
 *
 * `saturated` is true when the platform gave us as many events as it ever gives
 * (`eventCap`). When that happens, the account did more than we can see, so any
 * count we make from this list is a minimum, not the real number.
 */
export function analyzeWindow(
	events: readonly IdentifyEvent[],
	eventCap?: number,
): WindowInfo {
	const times = events
		.map((event) => dayjs(event.at))
		.filter((time) => time.isValid())
		.sort((a, b) => a.valueOf() - b.valueOf());

	const first = times[0];
	const last = times[times.length - 1];

	return {
		eventCount: events.length,
		spanDays: first && last ? last.diff(first, "day", true) : 0,
		firstEventAt: first ? first.toISOString() : null,
		lastEventAt: last ? last.toISOString() : null,
		saturated: eventCap !== undefined && events.length >= eventCap,
	};
}
