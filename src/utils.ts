import { hoursBetween, isValidTime } from "./time";

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

/**
 * The highest level a value reaches, or undefined when it is below all of
 * them. Levels must go from the lowest `min` to the highest.
 *
 * @example
 * levelFor(12, [{ min: 10, id: "high" }, { min: 15, id: "extreme" }]); // { min: 10, id: "high" }
 */
export function levelFor<Level extends { min: number }>(
	value: number,
	levels: readonly Level[],
): Level | undefined {
	let reached: Level | undefined;

	for (const level of levels) {
		if (value >= level.min) {
			reached = level;
		}
	}

	return reached;
}

/** Put items into lists by key. Keys and items keep the order they came in. */
export function groupBy<Item, Key>(
	items: Iterable<Item>,
	keyOf: (item: Item) => Key,
): Map<Key, Item[]> {
	const groups = new Map<Key, Item[]>();

	for (const item of items) {
		const key = keyOf(item);
		const group = groups.get(key);
		if (group) {
			group.push(item);
		} else {
			groups.set(key, [item]);
		}
	}

	return groups;
}

/** Count items by key. */
export function countBy<Item, Key>(
	items: Iterable<Item>,
	keyOf: (item: Item) => Key,
): Map<Key, number> {
	const counts = new Map<Key, number>();

	for (const item of items) {
		const key = keyOf(item);
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	return counts;
}

type TimedItem<T> = {
	item: T;
	time: number;
};

function sortByTime<T>(
	items: readonly T[],
	getTime: (item: T) => number,
): TimedItem<T>[] {
	return items
		.map((item) => ({ item, time: getTime(item) }))
		.filter((entry) => isValidTime(entry.time))
		.sort((a, b) => a.time - b.time);
}

type WindowBounds = {
	/** Index of the first item in the window. */
	start: number;
	/** Index of the last item in the window. */
	end: number;
};

/**
 * Slide a window of `windowHours` along a list sorted oldest first, and yield
 * the window that ends at each item. The window keeps every earlier item that
 * is at most `windowHours` older than that last item.
 */
function* slidingWindows(
	timeline: readonly TimedItem<unknown>[],
	windowHours: number,
): Generator<WindowBounds> {
	let start = 0;

	for (const [end, entry] of timeline.entries()) {
		while (
			hoursBetween(timeline[start]?.time ?? entry.time, entry.time) >
			windowHours
		) {
			start++;
		}

		yield { start, end };
	}
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
	const timeline = sortByTime(items, getTime);
	let busiest: WindowBounds = { start: 0, end: -1 };

	for (const window of slidingWindows(timeline, windowHours)) {
		const size = window.end - window.start;
		if (size > busiest.end - busiest.start) {
			busiest = window;
		}
	}

	const busiestItems = timeline
		.slice(busiest.start, busiest.end + 1)
		.map((entry) => entry.item);

	return {
		count: busiestItems.length,
		items: busiestItems,
	};
}

export type DistinctWindow<T> = {
	/** How many different keys the busiest window holds. */
	distinct: number;
	/** The items in that window. */
	items: T[];
};

/**
 * Like `densestWindow`, but counts different keys instead of items: ten
 * comments on one repository count once. Use it to find bursts that spray
 * over many repositories or pull requests.
 */
export function densestDistinctWindow<T>(
	items: readonly T[],
	getTime: (item: T) => number,
	getKey: (item: T) => string,
	windowHours: number,
): DistinctWindow<T> {
	const timeline = sortByTime(items, getTime);
	let busiest: WindowBounds = { start: 0, end: -1 };
	let mostKeys = 0;

	for (const window of slidingWindows(timeline, windowHours)) {
		const windowItems = timeline.slice(window.start, window.end + 1);
		const keys = new Set(windowItems.map((entry) => getKey(entry.item)));

		if (keys.size > mostKeys) {
			mostKeys = keys.size;
			busiest = window;
		}
	}

	const busiestItems = timeline
		.slice(busiest.start, busiest.end + 1)
		.map((entry) => entry.item);

	return {
		distinct: mostKeys,
		items: busiestItems,
	};
}
