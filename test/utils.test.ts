import { describe, expect, it } from "vitest";
import {
	countBy,
	densestDistinctWindow,
	densestWindow,
	groupBy,
	levelFor,
} from "../src/utils";

const HOUR = 3_600_000;
const MINUTE = 60_000;

describe("densestWindow", () => {
	const atHour = (hour: number) => hour * HOUR;

	it("finds the busiest stretch anywhere in the list", () => {
		const window = densestWindow([0, 1, 50, 51, 52, 53, 100], atHour, 24);

		expect(window.count).toBe(4);
		expect(window.items).toEqual([50, 51, 52, 53]);
	});

	it("keeps two items exactly one window apart together", () => {
		expect(densestWindow([0, 24], atHour, 24).count).toBe(2);
		expect(densestWindow([0, 25], atHour, 24).count).toBe(1);
	});

	it("skips items without a readable time", () => {
		expect(densestWindow([Number.NaN, 1, 2], atHour, 24).count).toBe(2);
	});

	it("is empty for an empty list", () => {
		expect(densestWindow([], atHour, 24)).toEqual({ count: 0, items: [] });
	});
});

describe("densestDistinctWindow", () => {
	it("counts different keys, not items", () => {
		// Five comments in one repo, then three comments in three repos.
		const comments = [
			...[0, 1, 2, 3, 4].map((minute) => ({ minute, repo: "a/one" })),
			...[60, 61, 62].map((minute, i) => ({ minute, repo: `b/${i}` })),
		];

		const window = densestDistinctWindow(
			comments,
			(comment) => comment.minute * MINUTE,
			(comment) => comment.repo,
			2 / 60,
		);

		expect(window.distinct).toBe(3);
		expect(window.items.map((comment) => comment.minute)).toEqual([
			60, 61, 62,
		]);
	});
});

describe("levelFor", () => {
	const levels = [
		{ min: 10, id: "high" },
		{ min: 15, id: "extreme" },
	] as const;

	it("picks the highest level the value reaches", () => {
		expect(levelFor(9, levels)).toBeUndefined();
		expect(levelFor(10, levels)?.id).toBe("high");
		expect(levelFor(14, levels)?.id).toBe("high");
		expect(levelFor(100, levels)?.id).toBe("extreme");
	});
});

describe("groupBy and countBy", () => {
	const words = ["banana", "apple", "blueberry"];
	const firstLetter = (word: string) => word.charAt(0);

	it("keep keys in the order they first came in", () => {
		expect([...groupBy(words, firstLetter)]).toEqual([
			["b", ["banana", "blueberry"]],
			["a", ["apple"]],
		]);
		expect([...countBy(words, firstLetter)]).toEqual([
			["b", 2],
			["a", 1],
		]);
	});
});
