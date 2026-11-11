import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubEvent } from "../src/providers/github";
import { event, reportGitHub, user } from "./utils/events";

/** One push every `everyMinutes`, from `fromHour` to `toHour` UTC, on each day. */
function pushes(
	days: number[],
	fromHour: number,
	toHour: number,
	everyMinutes: number,
): GitHubEvent[] {
	const events: GitHubEvent[] = [];
	for (const day of days) {
		for (let minute = fromHour * 60; minute < toHour * 60; minute += everyMinutes) {
			const at = new Date(Date.UTC(2026, 5, day, 0, minute));
			events.push(event("PushEvent", at.toISOString(), "user/app"));
		}
	}
	return events;
}

/** An account old enough for every softer check. */
const veteran = user({ created_at: "2015-01-01T00:00:00Z", public_repos: 40 });

function marathonFlags(events: GitHubEvent[]) {
	const result = reportGitHub({ user: veteran, events });

	return result.flags.filter(
		(f) => f.id === "coding-streak" || f.id === "coding-marathons",
	);
}

describe("coding marathons", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("flags an old account that codes around the clock for days in a row", () => {
		const flags = marathonFlags(pushes([10, 11, 12], 0, 24, 40));

		expect(flags.map((f) => f.id)).toEqual(["coding-streak"]);
	});

	it("does not flag long but normal working days", () => {
		const flags = marathonFlags(pushes([8, 9, 10, 11, 12, 15, 16], 8, 20, 15));

		expect(flags).toEqual([]);
	});

	it("does not flag one all-nighter between normal days", () => {
		const events = [
			...pushes([8, 9], 9, 18, 30),
			...pushes([10], 0, 24, 40),
			...pushes([11, 12], 9, 18, 30),
		];

		expect(marathonFlags(events)).toEqual([]);
	});
});
