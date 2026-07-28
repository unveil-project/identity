import { describe, expect, it } from "vitest";
import { CONFIG } from "../src/config";
import { identify } from "../src/identify";
import { estimateUtcOffset } from "../src/timezone";
import type { GitHubEvent } from "../src/types";
import { event, user } from "./utils/events";

function workingHours(fromHourUtc: number, toHourUtc: number): GitHubEvent[] {
	const events: GitHubEvent[] = [];
	for (let day = 0; day < 10; day++) {
		for (let hour = fromHourUtc; hour <= toHourUtc; hour++) {
			events.push(
				event(
					"PushEvent",
					new Date(Date.UTC(2026, 3, 1 + day, hour)).toISOString(),
					"user/project",
				),
			);
		}
	}
	return events;
}

describe("estimateUtcOffset", () => {
	it("finds a positive offset from normal working hours", () => {
		// Someone in UTC+9 working 09:00-17:00 their time is 00:00-08:00 UTC.
		const estimate = estimateUtcOffset(workingHours(0, 8));
		expect(estimate.offsetHours).toBeGreaterThanOrEqual(8);
		expect(estimate.offsetHours).toBeLessThanOrEqual(11);
		expect(estimate.confidence).toBeGreaterThan(0.5);
	});

	it("finds a negative offset from normal working hours", () => {
		// Someone in UTC-5 working 09:00-17:00 their time is 14:00-22:00 UTC.
		const estimate = estimateUtcOffset(workingHours(14, 22));
		expect(estimate.offsetHours).toBeGreaterThanOrEqual(-6);
		expect(estimate.offsetHours).toBeLessThanOrEqual(-3);
	});

	it("finds no pattern when the account is busy at every hour", () => {
		const estimate = estimateUtcOffset(workingHours(0, 23));
		expect(estimate.confidence).toBeLessThan(CONFIG.TZ_MIN_CONFIDENCE);
		expect(estimate.offsetHours).toBe(0);
	});

	it("does not guess when there are too few events", () => {
		const estimate = estimateUtcOffset([
			event("PushEvent", "2026-04-01T10:00:00Z", "user/project"),
		]);
		expect(estimate).toEqual({ offsetHours: 0, confidence: 0 });
	});
});

describe("24/7 detection across timezones", () => {
	// The same busy period, moved so it runs over UTC midnight
	function roundTheClockDay(startUtcHour: number): GitHubEvent[] {
		const events: GitHubEvent[] = [];
		for (let i = 0; i < 23; i++) {
			if (i === 12) continue; // one quiet hour
			events.push(
				event(
					"PushEvent",
					new Date(Date.UTC(2026, 3, 10, startUtcHour + i, 0)).toISOString(),
					"user/project",
				),
			);
			events.push(
				event(
					"PushEvent",
					new Date(Date.UTC(2026, 3, 10, startUtcHour + i, 30)).toISOString(),
					"user/project",
				),
			);
		}
		return events;
	}

	it.each([0, 6, 18])(
		"finds the same 24/7 pattern wherever UTC midnight falls (start %i)",
		(startHour) => {
			const result = identify({
				user: user({ login: "user", created_at: "2020-01-01T00:00:00Z", public_repos: 5 }),
				events: roundTheClockDay(startHour),
			});
			expect(result.flags.some((f) => f.label === "24/7 activity pattern")).toBe(
				true,
			);
		},
	);
});
