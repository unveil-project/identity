import dayjs from "dayjs";
import type { GitHubEvent } from "./types";

/**
 * Measure how spread out a set of counts is.
 * Low = concentrated in a few buckets (bot-like). High = evenly spread.
 */
function calculateShannonsEntropy(counts: number[]): number {
	if (counts.length === 0) return 0;

	const total = counts.reduce((sum, count) => sum + count, 0);
	if (total === 0) return 0;

	let entropy = 0;
	for (const count of counts) {
		if (count > 0) {
			const probability = count / total;
			entropy -= probability * Math.log2(probability);
		}
	}

	return entropy;
}

/**
 * Same measure, rescaled to 0-1 so lists of different sizes can be compared.
 * 0 = all in one bucket, 1 = perfectly even.
 */
export function calculateNormalizedShannonsEntropy(counts: number[]): number {
	if (counts.length <= 1) return 0;

	const entropy = calculateShannonsEntropy(counts);
	const maxEntropy = Math.log2(counts.length);

	return entropy / maxEntropy;
}

export type RampAnchor = readonly [value: number, points: number];

/**
 * Turn a number into points using [value, points] pairs, sorted small to large.
 *
 * A value between two pairs lands between their points; outside the range it
 * clamps to the first or last. Sliding instead of jumping means one extra fork
 * (or PR, or comment) can never suddenly double the score.
 */
export function rampPoints(
	value: number,
	anchors: readonly RampAnchor[],
): number {
	const first = anchors[0];
	if (!first) return 0;
	if (value <= first[0]) return first[1];

	const last = anchors[anchors.length - 1];
	if (!last) return 0;
	if (value >= last[0]) return last[1];

	for (let i = 1; i < anchors.length; i++) {
		const lower = anchors[i - 1];
		const upper = anchors[i];
		if (!lower || !upper) continue;
		if (value <= upper[0]) {
			const span = upper[0] - lower[0];
			if (span <= 0) return upper[1];
			const t = (value - lower[0]) / span;
			return Math.round(lower[1] + t * (upper[1] - lower[1]));
		}
	}

	return last[1];
}

/**
 * Describe how long a burst lasted, in words.
 *
 * Uses minutes for short bursts so we never report "0 hours" for something
 * like twenty stars in forty minutes.
 */
export function formatWindowDuration(
	start: dayjs.Dayjs | undefined,
	end: dayjs.Dayjs | undefined,
): string {
	const minutes = start && end ? end.diff(start, "minute", true) : 0;

	if (minutes < 1) return "under a minute";

	if (minutes < 90) {
		const rounded = Math.round(minutes);
		return `${rounded} minute${rounded === 1 ? "" : "s"}`;
	}

	const hours = Math.round(minutes / 60);
	return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export type DensestWindow<T> = {
	/** How many items landed in the busiest window. */
	count: number;
	/** Those items. */
	items: T[];
};

/**
 * Find the busiest stretch of `windowHours`, anywhere in the list.
 *
 * Scanning the whole list instead of counting back from today keeps the result
 * stable whenever we run the check, and old bursts stay visible.
 */
export function densestWindow<T>(
	items: readonly T[],
	getTime: (item: T) => dayjs.Dayjs,
	windowHours: number,
): DensestWindow<T> {
	if (items.length === 0) return { count: 0, items: [] };

	const sorted = [...items]
		.map((item) => ({ item, time: getTime(item) }))
		.filter((entry) => entry.time.isValid())
		.sort((a, b) => a.time.valueOf() - b.time.valueOf());

	let best = 0;
	let bestStart = 0;
	let bestEnd = 0;
	let start = 0;

	for (let end = 0; end < sorted.length; end++) {
		const endTime = sorted[end]?.time;
		if (!endTime) continue;

		while (
			sorted[start] &&
			endTime.diff(sorted[start].time, "hour", true) > windowHours
		) {
			start++;
		}

		const count = end - start + 1;
		if (count > best) {
			best = count;
			bestStart = start;
			bestEnd = end;
		}
	}

	return {
		count: best,
		items: sorted.slice(bestStart, bestEnd + 1).map((entry) => entry.item),
	};
}

/** Convenience wrapper around `densestWindow` for GitHub events. */
export function densestEventWindow(
	events: readonly GitHubEvent[],
	windowHours: number,
): DensestWindow<GitHubEvent> {
	return densestWindow(events, (e) => dayjs(e.created_at), windowHours);
}
