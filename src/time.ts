const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function toTime(value: string | undefined | null): number {
	return Date.parse(value ?? "");
}

export function isValidTime(time: number): boolean {
	return !Number.isNaN(time);
}

export function toISO(time: number): string {
	return new Date(time).toISOString();
}

/** The calendar day as YYYY-MM-DD, in UTC. */
export function toDay(time: number): string {
	return toISO(time).slice(0, 10);
}

export function addHours(time: number, hours: number): number {
	return time + hours * HOUR;
}

export function secondsBetween(start: number, end: number): number {
	return (end - start) / SECOND;
}

export function minutesBetween(start: number, end: number): number {
	return (end - start) / MINUTE;
}

export function hoursBetween(start: number, end: number): number {
	return (end - start) / HOUR;
}

export function daysBetween(start: number, end: number): number {
	return (end - start) / DAY;
}

export type TimeRange = {
	start: number;
	end: number;
};

/** The earliest and the latest valid time in a list, or null when there is none. */
export function timeRange(times: Iterable<number>): TimeRange | null {
	let start = Number.POSITIVE_INFINITY;
	let end = Number.NEGATIVE_INFINITY;

	for (const time of times) {
		if (!isValidTime(time)) {
			continue;
		}

		start = Math.min(start, time);
		end = Math.max(end, time);
	}

	if (start > end) {
		return null;
	}

	return { start, end };
}

/** Minutes between the earliest and the latest time in a list. */
export function spanMinutes(times: Iterable<number>): number {
	const range = timeRange(times);
	if (!range) {
		return 0;
	}

	return minutesBetween(range.start, range.end);
}

/** Days between the earliest and the latest time in a list. */
export function spanDays(times: Iterable<number>): number {
	const range = timeRange(times);
	if (!range) {
		return 0;
	}

	return daysBetween(range.start, range.end);
}

export type DayStreak = {
	/** How many days in a row. */
	length: number;
	/** The first day of the run, as YYYY-MM-DD. */
	firstDay: string;
	/** The last day of the run, as YYYY-MM-DD. */
	lastDay: string;
};

/**
 * The longest run of back-to-back days in a list of YYYY-MM-DD days.
 * Repeated and empty days are ignored. When two runs are equally long, the
 * earlier one wins.
 */
export function longestDayStreak(days: Iterable<string>): DayStreak | null {
	const sorted = [...new Set(days)].filter(Boolean).sort();
	const first = sorted[0];
	if (first === undefined) {
		return null;
	}

	let longest: DayStreak = { length: 1, firstDay: first, lastDay: first };
	let current: DayStreak = { ...longest };

	for (let i = 1; i < sorted.length; i++) {
		const previous = sorted[i - 1] ?? "";
		const day = sorted[i] ?? "";

		if (daysBetween(toTime(previous), toTime(day)) === 1) {
			current = { ...current, length: current.length + 1, lastDay: day };
		} else {
			current = { length: 1, firstDay: day, lastDay: day };
		}

		if (current.length > longest.length) {
			longest = current;
		}
	}

	return longest;
}
