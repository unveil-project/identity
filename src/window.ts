import dayjs from "dayjs";
import { CONFIG } from "./config.ts";
import type { GitHubEvent, WindowInfo } from "./types.ts";

/**
 * Describe the list of events we were given.
 *
 * `saturated` is true when GitHub gave us as many events as it ever gives. When
 * that happens, the account did more than we can see, so any count we make from
 * this list is a minimum, not the real number.
 */
export function analyzeWindow(events: readonly GitHubEvent[]): WindowInfo {
	const times = events
		.map((event) => dayjs(event.created_at))
		.filter((time) => time.isValid())
		.sort((a, b) => a.valueOf() - b.valueOf());

	const first = times[0];
	const last = times[times.length - 1];

	return {
		eventCount: events.length,
		spanDays: first && last ? last.diff(first, "day", true) : 0,
		firstEventAt: first ? first.toISOString() : null,
		lastEventAt: last ? last.toISOString() : null,
		saturated: events.length >= CONFIG.EVENTS_WINDOW_CAP,
	};
}
