import type { Endpoints } from "@octokit/types";
import { describe, expect, it } from "vitest";
import {
	fromGitHub,
	fromGitHubEvent,
	GITHUB_EVENT_CAP,
	type GitHubEvent,
	type GitHubUser,
} from "../src/providers/github";
import { report } from "../src/report";
import type { ActivityEvent } from "../src/types";
import { event, user } from "./utils/events";

// Whole API responses must be accepted as they are. `tsc` fails here if the
// GitHub types ever ask for something the API does not send.
type ApiUser = Endpoints["GET /users/{username}"]["response"]["data"];
type ApiEvent =
	Endpoints["GET /users/{username}/events/public"]["response"]["data"][number];
export const acceptsApiUser = (u: ApiUser): GitHubUser => u;
export const acceptsApiEvent = (e: ApiEvent): GitHubEvent => e;

describe("fromGitHubEvent", () => {
	it("maps GitHub event types to its own types", () => {
		const types = [
			"PushEvent",
			"CreateEvent",
			"ForkEvent",
			"WatchEvent",
			"IssuesEvent",
			"IssueCommentEvent",
			"PullRequestEvent",
			"PullRequestReviewEvent",
			"PullRequestReviewCommentEvent",
			"CommitCommentEvent",
		].map(
			(type) =>
				fromGitHubEvent(event(type, "2026-01-01T00:00:00Z", "a/b"), "user")
					.type,
		);

		expect(types).toEqual([
			"push",
			"create",
			"fork",
			"star",
			"issue",
			"issue-comment",
			"pull-request",
			"review",
			"review-comment",
			"commit-comment",
		]);
	});

	it("keeps a type it does not know as it is", () => {
		const e = fromGitHubEvent(
			event("SomeNewEvent", "2026-01-01T00:00:00Z", "a/b"),
			"user",
		);
		expect(e.type).toBe("SomeNewEvent");
	});

	it("reads the payload fields the checks use", () => {
		const branch = fromGitHubEvent(
			event("CreateEvent", "2026-01-01T00:00:00Z", "user/repo", {
				ref_type: "branch",
				ref: "codex/fix",
			}),
			"user",
		);
		expect(branch).toMatchObject({
			at: "2026-01-01T00:00:00Z",
			repo: "user/repo",
			ref: { type: "branch", name: "codex/fix" },
		});

		const issue = fromGitHubEvent(
			event("IssuesEvent", "2026-01-01T00:00:00Z", "a/b", {
				action: "labeled",
				issue: { title: "[$50] Fix it" },
			}),
			"user",
		);
		expect(issue).toMatchObject({
			action: "labeled",
			issue: { title: "[$50] Fix it" },
		});
	});

	it("marks a PR as the account's when its head branch is in the account's repo", () => {
		const pr = (url: string) =>
			fromGitHubEvent(
				event("PullRequestEvent", "2026-01-01T00:00:00Z", "upstream/repo", {
					action: "closed",
					pull_request: { number: 7, head: { repo: { url } } },
				}),
				"User",
			).pullRequest;

		expect(pr("https://api.github.com/repos/user/repo")).toEqual({
			number: 7,
			isAuthor: true,
		});
		expect(pr("https://api.github.com/repos/someone/repo")).toEqual({
			number: 7,
			isAuthor: false,
		});
	});

	it("keeps the original event as the source", () => {
		const raw = event("PushEvent", "2026-01-01T00:00:00Z", "a/b");
		expect(fromGitHubEvent(raw, "user").source).toBe(raw);
	});
});

describe("fromGitHub", () => {
	it("builds the account and sets GitHub's event cap", () => {
		const input = fromGitHub({
			user: user({
				login: "octocat",
				created_at: "2020-01-01T00:00:00Z",
				public_repos: 3,
				type: "User",
			}),
			events: [],
		});

		expect(input.account).toEqual({
			login: "octocat",
			createdAt: "2020-01-01T00:00:00Z",
			publicRepos: 3,
			isApp: false,
		});
		expect(input.eventCap).toBe(GITHUB_EVENT_CAP);
	});

	it("reads the profile fields when GitHub sends them", () => {
		const input = fromGitHub({
			user: user({
				id: 583231,
				name: "The Octocat",
				bio: null,
				avatar_url: "https://avatars.githubusercontent.com/u/583231",
				html_url: "https://github.com/octocat",
				followers: 10,
				following: 2,
			}),
			events: [],
		});

		expect(input.account).toMatchObject({
			id: "583231",
			name: "The Octocat",
			bio: null,
			avatarUrl: "https://avatars.githubusercontent.com/u/583231",
			url: "https://github.com/octocat",
			followers: 10,
			following: 2,
		});
	});

	it("lets flag events be traced back to the GitHub event", () => {
		const events = Array.from({ length: 25 }, (_, i) =>
			event(
				"WatchEvent",
				new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
				`owner${i}/repo`,
			),
		);
		const result = report(fromGitHub({ user: user(), events }));
		const starFlag = result.flags.find((f) => f.group === "watch");

		expect(starFlag).toBeDefined();
		for (const e of starFlag?.events ?? []) {
			expect(events).toContain(e.source);
		}
	});
});

describe("report without a provider", () => {
	it("treats everything before the last slash as the owner", () => {
		// A nested group path: "team/sub" owns "team/sub/project".
		const events: ActivityEvent[] = Array.from({ length: 25 }, (_, i) => ({
			type: "push",
			at: new Date(Date.UTC(2026, 0, 1, i)).toISOString(),
			repo: "team/sub/project",
		}));
		const account = {
			login: "team/sub",
			createdAt: "2020-01-01T00:00:00Z",
			publicRepos: 0,
		};

		const own = report({ account, events });
		const foreign = report({
			account: { ...account, login: "someone" },
			events,
		});

		const external = (r: typeof own) =>
			r.flags.some((f) => f.id === "zero-repos-external");
		expect(external(own)).toBe(false);
		expect(external(foreign)).toBe(true);
	});
});
