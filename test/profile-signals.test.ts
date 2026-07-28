import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { identify } from "../src/identify";
import { user } from "./utils/events";

describe("profile checks", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("flags following many people with almost no followers", () => {
		const result = identify({
			user: user({ followers: 1, following: 400 }),
			events: [],
		});
		expect(
			result.flags.some((f) => f.label === "Unreciprocated follow pattern"),
		).toBe(true);
	});

	it("flags a completely empty profile", () => {
		const result = identify({
			user: user({ bio: "", blog: null, company: null, location: "" }),
			events: [],
		});
		expect(result.flags.some((f) => f.label === "No profile identity")).toBe(
			true,
		);
	});

	it("does not flag a filled-in profile", () => {
		const result = identify({
			user: user({
				followers: 80,
				following: 40,
				bio: "Engineer",
				location: "Berlin",
			}),
			events: [],
		});
		expect(result.flags.some((f) => f.group === "profile")).toBe(false);
	});

	it("checks nothing when the user has no profile fields", () => {
		const result = identify({ user: user(), events: [] });
		expect(result.flags.some((f) => f.group === "profile")).toBe(false);
	});
});
