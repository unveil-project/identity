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
