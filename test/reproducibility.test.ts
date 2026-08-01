import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { identify } from "../src/identify";
import { event, user } from "./utils/events";

describe("same result every run", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	const events = Array.from({ length: 30 }, (_, i) =>
		event(
			"PushEvent",
			new Date(
				Date.UTC(2026, 3, 1 + Math.floor(i / 3), 10 + (i % 3)),
			).toISOString(),
			"someone/project",
		),
	);

	function runAt(iso: string) {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(iso));
		const result = identify({
			user: user({ created_at: "2020-01-01T00:00:00Z", public_repos: 12 }),
			events,
		});
		vi.useRealTimers();
		return result;
	}

	it("gives the same flags no matter when it runs", () => {
		const early = runAt("2026-05-01T00:00:00Z");
		const late = runAt("2027-05-01T00:00:00Z");

		expect(late.flags.map((f) => f.label)).toEqual(
			early.flags.map((f) => f.label),
		);
		expect(late.score).toBe(early.score);
	});
});

describe("busiest time window", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("still finds a PR burst that happened months ago", () => {
		// 20 PRs to other people's repos in one day, two months ago. If we counted
		// back from today we would see none of them.
		const events = Array.from({ length: 20 }, (_, i) =>
			event(
				"PullRequestEvent",
				new Date(Date.UTC(2026, 4, 2, i % 24, i)).toISOString(),
				`target/repo${i}`,
				{ action: "opened" },
			),
		);

		const result = identify({
			user: user({ created_at: "2026-04-20T00:00:00Z", public_repos: 0 }),
			events,
		});

		expect(
			result.flags.some((f) => f.label === "High PR volume in a 24-hour window"),
		).toBe(true);
	});
});
