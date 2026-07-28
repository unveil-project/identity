import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { identify } from "../src/identify";
import type { GitHubEvent } from "../src/types";
import { event, user } from "./utils/events";

/** 15 events packed into a few days, including 5 fast PRs to one repo. */
function recentBurst(): GitHubEvent[] {
	const rapidPRs = Array.from({ length: 5 }, (_, i) =>
		event(
			"PullRequestEvent",
			new Date(Date.UTC(2026, 5, 20, 10, 0, i * 30)).toISOString(),
			"target/repo",
			{ action: "opened" },
		),
	);
	const rest = Array.from({ length: 10 }, (_, i) =>
		event(
			"PushEvent",
			new Date(Date.UTC(2026, 5, 21 + (i % 4), 9 + i)).toISOString(),
			"target/repo",
		),
	);
	return [...rapidPRs, ...rest];
}

/** The same events, but spread over three months instead of a few days. */
function spreadOut(): GitHubEvent[] {
	return Array.from({ length: 15 }, (_, i) =>
		event(
			"PushEvent",
			new Date(Date.UTC(2026, 3 + (i % 3), 1 + i, 12)).toISOString(),
			"target/repo",
		),
	);
}

describe("dormant accounts", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("flags an old account with no repos whose activity is all recent", () => {
		const result = identify({
			user: user({ created_at: "2018-01-01T00:00:00Z", public_repos: 0 }),
			events: recentBurst(),
		});

		expect(
			result.flags.some(
				(f) => f.label === "Activity inconsistent with account age",
			),
		).toBe(true);
	});

	it("does not flag an old account that has a real repo history", () => {
		const result = identify({
			user: user({ created_at: "2018-01-01T00:00:00Z", public_repos: 40 }),
			events: recentBurst(),
		});

		expect(
			result.flags.some(
				(f) => f.label === "Activity inconsistent with account age",
			),
		).toBe(false);
	});

	it("does not flag an old account whose activity is spread out", () => {
		const result = identify({
			user: user({ created_at: "2018-01-01T00:00:00Z", public_repos: 0 }),
			events: spreadOut(),
		});

		expect(
			result.flags.some(
				(f) => f.label === "Activity inconsistent with account age",
			),
		).toBe(false);
	});

	it("does not flag a young account", () => {
		const result = identify({
			user: user({ created_at: "2026-05-01T00:00:00Z", public_repos: 0 }),
			events: recentBurst(),
		});

		expect(
			result.flags.some(
				(f) => f.label === "Activity inconsistent with account age",
			),
		).toBe(false);
	});

	it("removes the softer checks from a reactivated account", () => {
		// Both accounts are old enough for the softer checks, and both do the same
		// 5 fast PRs to one repo. That is under the limit for old accounts (6) but
		// at or over the normal limit (4). Only the one with a real repo history
		// keeps the softer limit.
		const events = recentBurst();

		const trusted = identify({
			user: user({ created_at: "2018-01-01T00:00:00Z", public_repos: 40 }),
			events,
		});
		const reactivated = identify({
			user: user({ created_at: "2018-01-01T00:00:00Z", public_repos: 0 }),
			events,
		});

		expect(
			trusted.flags.some((f) => f.label === "Rapid PRs to repository"),
		).toBe(false);
		expect(
			reactivated.flags.some((f) => f.label === "Rapid PRs to repository"),
		).toBe(true);
	});
});
