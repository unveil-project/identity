import { describe, expect, it } from "vitest";
import {
	detectAccountAge,
	detectAccountSeniority,
} from "../src/detectors/account-age";
import { CONFIG } from "../src/config";

describe("detectAccountSeniority", () => {
	it("returns no flag for a young account", () => {
		expect(detectAccountSeniority(90)).toHaveLength(0);
	});

	it("returns no flag at exactly one day below the senior threshold", () => {
		expect(detectAccountSeniority(CONFIG.AGE_SENIOR_ACCOUNT - 1)).toHaveLength(0);
	});

	it("flags established account at exactly the senior threshold (3+ years)", () => {
		const flags = detectAccountSeniority(CONFIG.AGE_SENIOR_ACCOUNT);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Established account");
		expect(flags[0].points).toBe(CONFIG.POINTS_SENIOR_ACCOUNT);
		expect(flags[0].points).toBeLessThan(0);
	});

	it("flags established account between senior and veteran thresholds", () => {
		const age = CONFIG.AGE_VETERAN_ACCOUNT - 1;
		const flags = detectAccountSeniority(age);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Established account");
	});

	it("flags long-standing account at exactly the veteran threshold (5+ years)", () => {
		const flags = detectAccountSeniority(CONFIG.AGE_VETERAN_ACCOUNT);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Long-standing account");
		expect(flags[0].points).toBe(CONFIG.POINTS_VETERAN_ACCOUNT);
		expect(flags[0].points).toBeLessThan(0);
	});

	it("flags long-standing account well above the veteran threshold", () => {
		const flags = detectAccountSeniority(CONFIG.AGE_VETERAN_ACCOUNT + 500);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Long-standing account");
	});

	it("does not return both flags at once", () => {
		expect(detectAccountSeniority(CONFIG.AGE_VETERAN_ACCOUNT)).toHaveLength(1);
	});
});

describe("detectAccountAge", () => {
	it("flags a new account below the new-account threshold", () => {
		const flags = detectAccountAge(CONFIG.AGE_NEW_ACCOUNT - 1);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Recently created");
		expect(flags[0].points).toBeGreaterThan(0);
	});

	it("flags a young account between new and young thresholds", () => {
		const age = Math.floor((CONFIG.AGE_NEW_ACCOUNT + CONFIG.AGE_YOUNG_ACCOUNT) / 2);
		const flags = detectAccountAge(age);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Young account");
	});

	it("returns no flag for an account at or above the young threshold", () => {
		expect(detectAccountAge(CONFIG.AGE_YOUNG_ACCOUNT)).toHaveLength(0);
	});
});
