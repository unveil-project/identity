import { hoursBetween, isValidTime, toTime } from "./time";
import type { IdentifyEvent } from "./types";

/**
 * Measure how spread out a set of counts is.
 * Low = concentrated in a few buckets (bot-like). High = evenly spread.
 */
function calculateShannonsEntropy(counts: number[]): number {
	if (counts.length === 0) {
		return 0;
	}

	const total = counts.reduce((sum, count) => sum + count, 0);
	if (total === 0) {
		return 0;
	}

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
	if (counts.length <= 1) {
		return 0;
	}

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
	if (!first) {
		return 0;
	}

	if (value <= first[0]) {
		return first[1];
	}

	const last = anchors[anchors.length - 1];
	if (!last) {
		return 0;
	}

	if (value >= last[0]) {
		return last[1];
	}

	for (let i = 1; i < anchors.length; i++) {
		const lower = anchors[i - 1];
		const upper = anchors[i];
		if (!lower || !upper) {
			continue;
		}

		if (value <= upper[0]) {
			const span = upper[0] - lower[0];
			if (span <= 0) {
				return upper[1];
			}

			const t = (value - lower[0]) / span;

			return Math.round(lower[1] + t * (upper[1] - lower[1]));
		}
	}

	return last[1];
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
	getTime: (item: T) => number,
	windowHours: number,
): DensestWindow<T> {
	if (items.length === 0) {
		return { count: 0, items: [] };
	}

	const sorted = [...items]
		.map((item) => ({ item, time: getTime(item) }))
		.filter((entry) => isValidTime(entry.time))
		.sort((a, b) => a.time - b.time);

	let best = 0;
	let bestStart = 0;
	let bestEnd = 0;
	let start = 0;

	for (let end = 0; end < sorted.length; end++) {
		const endTime = sorted[end]?.time;
		if (!endTime) {
			continue;
		}

		while (
			sorted[start] &&
			hoursBetween(sorted[start].time, endTime) > windowHours
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
	events: readonly IdentifyEvent[],
	windowHours: number,
): DensestWindow<IdentifyEvent> {
	return densestWindow(events, (e) => toTime(e.at), windowHours);
}

/** The owner part of "owner/name": everything before the last slash. */
export function ownerOf(repo: string): string {
	const slash = repo.lastIndexOf("/");

	return slash === -1 ? repo : repo.slice(0, slash);
}

/** The name part of "owner/name": everything after the last slash. */
export function nameOf(repo: string): string | undefined {
	const slash = repo.lastIndexOf("/");

	return slash === -1 ? undefined : repo.slice(slash + 1);
}
