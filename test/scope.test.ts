import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { classify } from "../src";
import { fromGitHub, type GitHubEvent } from "../src/providers/github";
import { event, reportGitHub, user } from "./utils/events";

const maintainer = user({
	login: "dev",
	created_at: "2018-01-01T00:00:00Z",
	public_repos: 10,
});

/** 35 PRs in one day, each a few minutes apart. */
function prBurst(repoFor: (i: number) => string): GitHubEvent[] {
	return Array.from({ length: 35 }, (_, i) =>
		event(
			"PullRequestEvent",
			new Date(Date.UTC(2026, 5, 10, 6, i * 5)).toISOString(),
			repoFor(i),
			{ action: "opened" },
		),
	);
}

/** One push a day for 30 days, to give the account a steady history. */
function dailyPushes(repo: string): GitHubEvent[] {
	return Array.from({ length: 30 }, (_, i) =>
		event("PushEvent", new Date(Date.UTC(2026, 4, 1 + i, 10)).toISOString(), repo),
	);
}

function hasPRVolumeFlag(result: ReturnType<typeof reportGitHub>): boolean {
	return result.flags.some((f) => f.group === "pr-volume");
}

describe("scope: read-only", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-06-11T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("counts repos with push access by default", () => {
		// The account pushes to acme/app, so it is a collaborator there.
		const events = [...dailyPushes("acme/app"), ...prBurst(() => "acme/app")];

		const result = reportGitHub({ user: maintainer, events });

		expect(hasPRVolumeFlag(result)).toBe(true);
		expect(result.window.ignoredEventCount).toBe(0);
	});

	it("ignores PRs to a repo the account pushes to", () => {
		const events = [...dailyPushes("acme/app"), ...prBurst(() => "acme/app")];

		const result = reportGitHub(
			{ user: maintainer, events },
			{ scope: "read-only" },
		);

		expect(hasPRVolumeFlag(result)).toBe(false);
		expect(result.window.ignoredEventCount).toBe(65);
		expect(result.window.eventCount).toBe(0);
	});

	it("ignores the account's own repos", () => {
		const events = [...dailyPushes("dev/tools"), ...prBurst(() => "dev/tools")];

		const result = reportGitHub(
			{ user: maintainer, events },
			{ scope: "read-only" },
		);

		expect(hasPRVolumeFlag(result)).toBe(false);
		expect(result.window.ignoredEventCount).toBe(65);
	});

	it("still flags PRs to repos the account has no push access to", () => {
		// Only PRs to strangers, no pushes there: the account has read-only access.
		const events = [
			...dailyPushes("acme/app"),
			...prBurst((i) => `stranger${i}/repo`),
		];

		const result = reportGitHub(
			{ user: maintainer, events },
			{ scope: "read-only" },
		);

		expect(hasPRVolumeFlag(result)).toBe(true);
		expect(result.window.ignoredEventCount).toBe(30);
		expect(result.window.eventCount).toBe(35);
	});

	it("says insufficient-data when nothing is left to look at", () => {
		const events = [...dailyPushes("acme/app"), ...prBurst(() => "acme/app")];

		const result = classify(fromGitHub({ user: maintainer, events }), {
			scope: "read-only",
		});

		expect(result.classification).toBe("insufficient-data");
	});
});
