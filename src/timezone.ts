import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { CONFIG } from "./config";
import type { GitHubEvent, TimezoneEstimate } from "./types";

dayjs.extend(utc);

const HOURS = 24;
const RADIANS_PER_HOUR = (2 * Math.PI) / HOURS;

/**
 * Guess the account's timezone by looking at what time of day it is active.
 *
 * We cannot just take a normal average of the hours, because hours go in a
 * circle: 23:00 and 00:00 are next to each other, but a normal average of them
 * gives 11:30, which is the opposite side of the day. So we put each hour on a
 * circle and average the positions instead.
 *
 * That gives us the time of day the account is usually busy. We assume that
 * time is early afternoon where the person lives, and work out the offset from
 * there.
 *
 * `confidence` tells us how clear the pattern is. It is close to 0 when the
 * account is busy at every hour, which means there is no pattern to find. In
 * that case we give up and return an offset of 0.
 */
export function estimateUtcOffset(
	events: readonly GitHubEvent[],
): TimezoneEstimate {
	let cos = 0;
	let sin = 0;
	let total = 0;

	for (const event of events) {
		const time = dayjs.utc(event.created_at);
		if (!time.isValid()) continue;
		const hour = time.hour() + time.minute() / 60;
		const angle = hour * RADIANS_PER_HOUR;
		cos += Math.cos(angle);
		sin += Math.sin(angle);
		total++;
	}

	if (total < CONFIG.TZ_MIN_EVENTS) {
		return { offsetHours: 0, confidence: 0 };
	}

	const resultantLength = Math.sqrt(cos * cos + sin * sin) / total;
	const confidence =
		Math.round(Math.min(1, Math.max(0, resultantLength)) * 100) / 100;

	if (confidence < CONFIG.TZ_MIN_CONFIDENCE) {
		return { offsetHours: 0, confidence };
	}

	let meanHourUtc = Math.atan2(sin, cos) / RADIANS_PER_HOUR;
	if (meanHourUtc < 0) meanHourUtc += HOURS;

	let offset = Math.round(CONFIG.TZ_LOCAL_ACTIVITY_CENTER - meanHourUtc);

	// Keep the offset inside the range that real timezones use
	while (offset < -12) offset += HOURS;
	while (offset > 14) offset -= HOURS;

	return { offsetHours: offset, confidence };
}

/** Move a timestamp into the account's own local time. */
export function toLocal(
	value: string | undefined | null,
	offsetHours: number,
): dayjs.Dayjs {
	return dayjs.utc(value ?? undefined).add(offsetHours, "hour");
}

/** The day in the account's own local time, as YYYY-MM-DD. */
export function localDay(
	value: string | undefined | null,
	offsetHours: number,
): string {
	return toLocal(value, offsetHours).format("YYYY-MM-DD");
}

/** The hour (0–23) in the account's own local time. */
export function localHour(
	value: string | undefined | null,
	offsetHours: number,
): number {
	return toLocal(value, offsetHours).hour();
}
