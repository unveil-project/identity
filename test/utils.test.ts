import { describe, expect, it } from "vitest";
import { computeActivityRecencyMultiplier } from "../src/utils";

describe("computeActivityRecencyMultiplier", () => {
	it("returns 1 for empty events", () => {
		expect(computeActivityRecencyMultiplier([], 90)).toBe(1);
	});

	it("treats missing created_at as weight 1", () => {
		const result = computeActivityRecencyMultiplier([{ created_at: null }, { created_at: undefined }], 90);
		expect(result).toBe(1);
	});

	it("does not produce NaN for malformed created_at", () => {
		const result = computeActivityRecencyMultiplier([{ created_at: "not-a-date" }], 90);
		expect(Number.isNaN(result)).toBe(false);
		expect(result).toBe(1);
	});

	it("returns a value between 0 and 1 for old events", () => {
		const old = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
		const result = computeActivityRecencyMultiplier([{ created_at: old }], 90);
		expect(result).toBeGreaterThan(0);
		expect(result).toBeLessThan(1);
	});

	it("returns close to 1 for very recent events", () => {
		const recent = new Date(Date.now() - 60 * 1000).toISOString();
		const result = computeActivityRecencyMultiplier([{ created_at: recent }], 90);
		expect(result).toBeCloseTo(1, 3);
	});
});
