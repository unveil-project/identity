import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config";
import { GITHUB_EVENT_CAP } from "../src/providers/github";
import { analyzeWindow } from "../src/window";
import { event, identifyGitHub, toEvents, user } from "./utils/events";

describe("analyzeWindow", () => {
	it("marks a full event list as saturated", () => {
		const events = Array.from({ length: GITHUB_EVENT_CAP }, (_, i) =>
			event(
				"PushEvent",
				new Date(Date.UTC(2026, 5, 1, 0, i)).toISOString(),
				"user/project",
			),
		);
		expect(analyzeWindow(toEvents(events), GITHUB_EVENT_CAP).saturated).toBe(
			true,
		);
	});

	it("never marks a list as saturated without a cap", () => {
		const events = Array.from({ length: GITHUB_EVENT_CAP }, (_, i) =>
			event(
				"PushEvent",
				new Date(Date.UTC(2026, 5, 1, 0, i)).toISOString(),
				"user/project",
			),
		);
		expect(analyzeWindow(toEvents(events)).saturated).toBe(false);
	});

	it("does not mark a short event list as saturated", () => {
		const events = Array.from({ length: 10 }, (_, i) =>
			event(
				"PushEvent",
				new Date(Date.UTC(2026, 5, 1, i)).toISOString(),
				"user/project",
			),
		);
		const window = analyzeWindow(toEvents(events), GITHUB_EVENT_CAP);
		expect(window.saturated).toBe(false);
		expect(window.eventCount).toBe(10);
		expect(window.spanDays).toBeCloseTo(9 / 24, 3);
	});
});

describe("confidence and insufficient data", () => {
	it("does not say organic when there is almost no activity", () => {
		const events = Array.from({ length: 3 }, (_, i) =>
			event(
				"PushEvent",
				new Date(Date.UTC(2026, 5, 1, i)).toISOString(),
				"user/project",
			),
		);
		const result = identifyGitHub({
			user: user({ login: "user", created_at: "2020-01-01T00:00:00Z", public_repos: 4 }),
			events,
		});

		expect(result.classification).toBe("insufficient-data");
		expect(result.confidence).toBeLessThan(CONFIG.CONFIDENCE_MIN_FOR_RESULT);
	});

	it("still says automation when a few events trigger real checks", () => {
		const events = Array.from({ length: 8 }, (_, i) =>
			event(
				"ForkEvent",
				new Date(Date.UTC(2026, 5, 1, i)).toISOString(),
				`target/repo${i}`,
			),
		);
		const result = identifyGitHub({
			user: user({ login: "user", created_at: "2026-05-25T00:00:00Z", public_repos: 0 }),
			events,
		});

		expect(result.classification).toBe("automation");
	});
});
