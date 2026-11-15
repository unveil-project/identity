import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config";
import { capForAIAttribution, humanScore, scoreFlags } from "../src/scoring";
import type { Flag, FlagId } from "../src/types";
import { rampPoints } from "../src/utils";
import { flag } from "./utils/events";

describe("rampPoints", () => {
	const anchors = [
		[5, 26],
		[8, 51],
		[20, 70],
	] as const;

	it("gives exactly the listed points at each step", () => {
		expect(rampPoints(5, anchors)).toBe(26);
		expect(rampPoints(8, anchors)).toBe(51);
		expect(rampPoints(20, anchors)).toBe(70);
	});

	it("uses the first or last points outside the range", () => {
		expect(rampPoints(1, anchors)).toBe(26);
		expect(rampPoints(500, anchors)).toBe(70);
	});

	it("never goes down, and never jumps by a lot", () => {
		let previous = -Infinity;
		let biggestJump = 0;
		for (let value = 5; value <= 20; value++) {
			const points = rampPoints(value, anchors);
			expect(points).toBeGreaterThanOrEqual(previous);
			if (previous > -Infinity) {
				biggestJump = Math.max(biggestJump, points - previous);
			}
			previous = points;
		}
		expect(biggestJump).toBeLessThan(10);
	});
});

describe("scoreFlags", () => {
	it("adds up points from different groups", () => {
		const result = scoreFlags([flag("fork", 40), flag("account-age", 20)]);
		expect(result.total).toBe(60);
	});

	it("counts extra flags in the same group for less", () => {
		const result = scoreFlags([
			flag("pr-volume", 50),
			flag("pr-volume", 45),
			flag("pr-volume", 40),
		]);
		expect(result.total).toBe(71);
		const group = result.groups[0];
		expect(group?.rawPoints).toBe(135);
		expect(group?.flagCount).toBe(3);
	});

	it("always counts at least the biggest flag in the group", () => {
		const result = scoreFlags([flag("fork", 85), flag("fork", 5)]);
		expect(result.total).toBeGreaterThanOrEqual(85);
	});

	it("only multiplies flags marked as amplifiable", () => {
		const amplifiable: Flag = {
			...flag("fork", 40),
			amplifiable: true,
		};
		const fixed = flag("account-age", 40);
		const result = scoreFlags([amplifiable, fixed], { bountyMultiplier: 1.5 });
		expect(result.flags[0]?.effectivePoints).toBe(60);
		expect(result.flags[1]?.effectivePoints).toBe(40);
	});
});

describe("humanScore", () => {
	it("is 100 minus the penalty", () => {
		expect(humanScore(30)).toBe(70);
	});

	it("stays between 0 and 100", () => {
		expect(humanScore(0)).toBe(100);
		expect(humanScore(150)).toBe(0);
	});
});

describe("capForAIAttribution", () => {
	const AI_ATTRIBUTION_IDS: FlagId[] = [
		"ai-agent-app",
		"ai-branch-prefix",
		"ai-branch-volume",
		"ai-post-volume",
	];

	function aiFlag(id: FlagId): Flag {
		return { ...flag("ai-attribution", 0), id } as Flag;
	}

	it.each(AI_ATTRIBUTION_IDS)("keeps %s below organic", (id) => {
		expect(capForAIAttribution(100, [aiFlag(id)])).toBe(
			CONFIG.THRESHOLD_HUMAN - 1,
		);
	});

	it("leaves a score that is already below organic", () => {
		const flags = [aiFlag("ai-agent-app")];

		expect(capForAIAttribution(69, flags)).toBe(69);
		expect(capForAIAttribution(20, flags)).toBe(20);
	});

	it("does nothing without AI proof", () => {
		expect(capForAIAttribution(100, [flag("pr-volume", 10)])).toBe(100);
	});
});
