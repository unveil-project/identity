import { describe, expect, it } from "vitest";
import {
	collaboratorReposOf,
	externalEventsOf,
	hasHomeOwner,
	toTimeline,
} from "../src/events";
import { isExternalRepo, isOwnRepo } from "../src/repos";
import type { ActivityEvent } from "../src/types";

function activity(
	type: string,
	repo: string,
	at = "2026-01-01T00:00:00Z",
): ActivityEvent {
	return { type, repo, at };
}

describe("repository ownership", () => {
	it("ignores letter case in logins", () => {
		expect(isOwnRepo("Dev/app", "dev")).toBe(true);
		expect(isExternalRepo("dev/app", "DEV")).toBe(false);
		expect(isExternalRepo("acme/app", "dev")).toBe(true);
	});

	it("keeps only events on other people's repos", () => {
		const events = [activity("push", "dev/app"), activity("push", "acme/app")];

		expect(externalEventsOf(events, "dev").map((e) => e.repo)).toEqual([
			"acme/app",
		]);
	});
});

describe("toTimeline", () => {
	it("sorts events oldest first and drops unreadable times", () => {
		const timeline = toTimeline([
			activity("push", "a/b", "2026-01-02T00:00:00Z"),
			activity("push", "a/b", "not a date"),
			activity("push", "a/b", "2026-01-01T00:00:00Z"),
		]);

		expect(timeline.map((entry) => entry.event.at)).toEqual([
			"2026-01-01T00:00:00Z",
			"2026-01-02T00:00:00Z",
		]);
	});
});

describe("collaboratorReposOf", () => {
	it("lists other people's repos the account pushed to or branched in", () => {
		const events = [
			activity("push", "acme/api"),
			activity("create", "globex/ui"),
			activity("issue-comment", "initech/web"),
			activity("push", "dev/own"),
		];

		expect(collaboratorReposOf(events, "dev")).toEqual(
			new Set(["acme/api", "globex/ui"]),
		);
	});
});

describe("hasHomeOwner", () => {
	const onRepos = (repos: string[]) =>
		repos.map((repo) => activity("push", repo));

	it("is true when most outside activity is under one owner", () => {
		expect(hasHomeOwner(onRepos(["acme/a", "acme/b", "acme/c", "x/y"]))).toBe(
			true,
		);
	});

	it("is false when the activity spreads over many owners", () => {
		expect(hasHomeOwner(onRepos(["a/x", "b/x", "c/x", "d/x"]))).toBe(false);
	});

	it("ignores letter case in owners", () => {
		expect(hasHomeOwner(onRepos(["Acme/a", "acme/b", "x/y"]))).toBe(true);
	});

	it("is false without events", () => {
		expect(hasHomeOwner([])).toBe(false);
	});
});
