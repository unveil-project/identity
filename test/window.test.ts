import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config";
import { identify } from "../src/identify";
import { analyzeWindow } from "../src/window";
import { event, user } from "./utils/events";

describe("analyzeWindow", () => {
	it("marks a full event list as saturated", () => {
		const events = Array.from({ length: CONFIG.EVENTS_WINDOW_CAP }, (_, i) =>
			event(
				"PushEvent",
				new Date(Date.UTC(2026, 5, 1, 0, i)).toISOString(),
				"user/project",
			),
		);
		expect(analyzeWindow(events).saturated).toBe(true);
	});

	it("does not mark a short event list as saturated", () => {
		const events = Array.from({ length: 10 }, (_, i) =>
			event(
				"PushEvent",
				new Date(Date.UTC(2026, 5, 1, i)).toISOString(),
				"user/project",
			),
		);
		const window = analyzeWindow(events);
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
		const result = identify({
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
		const result = identify({
			user: user({ login: "user", created_at: "2026-05-25T00:00:00Z", public_repos: 0 }),
			events,
		});

		expect(result.classification).toBe("automation");
	});
});
