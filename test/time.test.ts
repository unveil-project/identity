import { describe, expect, it } from "vitest";
import { longestDayStreak, spanDays, spanMinutes, timeRange } from "../src/time";

describe("timeRange", () => {
	it("finds the earliest and the latest time, in any order", () => {
		expect(timeRange([30, 10, 20])).toEqual({ start: 10, end: 30 });
	});

	it("skips times that could not be read", () => {
		expect(timeRange([Number.NaN, 5])).toEqual({ start: 5, end: 5 });
	});

	it("is null without a readable time", () => {
		expect(timeRange([])).toBeNull();
		expect(timeRange([Number.NaN])).toBeNull();
	});
});

describe("spanDays and spanMinutes", () => {
	it("measure from the earliest to the latest time", () => {
		const start = Date.UTC(2026, 0, 1);

		expect(spanDays([Date.UTC(2026, 0, 3, 12), start])).toBe(2.5);
		expect(spanMinutes([start, start + 90_000])).toBe(1.5);
	});

	it("are 0 for an empty list", () => {
		expect(spanDays([])).toBe(0);
		expect(spanMinutes([])).toBe(0);
	});
});

describe("longestDayStreak", () => {
	it("finds the longest run of back-to-back days", () => {
		const days = [
			"2026-01-01",
			"2026-01-03",
			"2026-01-04",
			"2026-01-05",
			"2026-01-07",
		];

		expect(longestDayStreak(days)).toEqual({
			length: 3,
			firstDay: "2026-01-03",
			lastDay: "2026-01-05",
		});
	});

	it("ignores order, repeated days and empty days", () => {
		expect(
			longestDayStreak(["2026-01-02", "", "2026-01-01", "2026-01-02"]),
		).toEqual({ length: 2, firstDay: "2026-01-01", lastDay: "2026-01-02" });
	});

	it("runs across the end of a month", () => {
		expect(longestDayStreak(["2026-01-31", "2026-02-01"])?.length).toBe(2);
	});

	it("keeps the earlier run when two are equally long", () => {
		const days = ["2026-01-10", "2026-01-11", "2026-01-01", "2026-01-02"];

		expect(longestDayStreak(days)?.firstDay).toBe("2026-01-01");
	});

	it("is null without days", () => {
		expect(longestDayStreak([])).toBeNull();
	});
});
