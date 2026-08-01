import dayjs from "dayjs";
import type { GitHubEvent } from "./types";

/**
 * Calculate Shannon's entropy of a probability distribution
 * Lower entropy = more concentrated/predictable (bot-like)
 * Higher entropy = more uniformly distributed / random
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
 * Calculate normalized Shannon's entropy (0 to 1)
 * Useful for comparing distributions with different state counts
 * Returns 0-1 where 0 = completely concentrated, 1 = perfectly uniform
 */
export function calculateNormalizedShannonsEntropy(counts: number[]): number {
	if (counts.length <= 1) return 0;

	const entropy = calculateShannonsEntropy(counts);
	const maxEntropy = Math.log2(counts.length);

	return entropy / maxEntropy;
}

export type RampAnchor = readonly [value: number, points: number];

/**
 * Turn a number into points, sliding smoothly between fixed steps.
 *
 * `anchors` is a list of [value, points] pairs, ordered from small to large.
 * A value that matches a pair gets exactly those points. A value in between two
 * pairs gets points in between. Anything below the first pair or above the last
 * one gets the first or last points.
 *
 * We slide instead of jumping so that one extra fork (or PR, or comment) can
 * never suddenly double the points.
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

export type DensestWindow<T> = {
	/** Number of items in the densest window found. */
	count: number;
	/** The items inside that window. */
	items: T[];
};

/**
 * Find the busiest stretch of time of a given length, anywhere in the list.
 *
 * We look for the busiest stretch instead of counting back from today. This way
 * the answer stays the same no matter when we run the check, and an old burst
 * of activity cannot slip out of view.
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
