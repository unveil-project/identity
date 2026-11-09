import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubEvent } from "../src/providers/github";
import { event, reportGitHub, user } from "./utils/events";

/** A few days of pushes to the account's own project. */
function ownPushes(login: string, count: number): GitHubEvent[] {
	return Array.from({ length: count }, (_, i) =>
		event(
			"PushEvent",
			new Date(Date.UTC(2026, 5, 10 + (i % 5), 9 + i)).toISOString(),
			`${login}/my-project`,
		),
	);
}

function pullRequests(repos: string[]): GitHubEvent[] {
	return repos.map((repo, i) =>
		event(
			"PullRequestEvent",
			new Date(Date.UTC(2026, 5, 16 + i, 15)).toISOString(),
			repo,
			{ action: "opened" },
		),
	);
}

const newcomer = user({
	login: "newbie",
	created_at: "2026-06-05T00:00:00Z",
	public_repos: 2,
});

describe("newcomers", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("does not count a first contribution as limited engagement", () => {
		const result = reportGitHub({
			user: newcomer,
			events: [...ownPushes("newbie", 10), ...pullRequests(["vitejs/vite"])],
		});

		expect(result.flags.some((f) => f.id === "limited-engagement")).toBe(false);
	});

	it("does not treat a new team member as a drive-by account", () => {
		// A new hire's account: no repos of its own, all work in the company's
		// repos. It looks like an account that lives on other people's repos,
		// but it has one clear home.
		const work = Array.from({ length: 30 }, (_, i) => {
			const at = new Date(Date.UTC(2026, 5, 15 + (i % 12), 9 + (i % 8)));
			const kinds = [
				["PushEvent", {}],
				["PullRequestEvent", { action: "opened" }],
				["PullRequestReviewEvent", { action: "created" }],
			] as const;
			const [type, payload] = kinds[i % kinds.length] ?? kinds[0];

			return event(type, at.toISOString(), `company/service${i % 3}`, payload);
		});

		const result = reportGitHub({
			user: user({
				login: "new-hire",
				created_at: "2026-06-12T00:00:00Z",
				public_repos: 0,
			}),
			events: work,
		});

		expect(result.flags.map((f) => f.id)).toEqual(["new-account"]);
		expect(result.classification).toBe("organic");
	});

	it("flags a young account that only sends PRs to other projects", () => {
		const result = reportGitHub({
			user: newcomer,
			events: [
				...ownPushes("newbie", 10),
				...pullRequests(["vitejs/vite", "vuejs/core", "nuxt/nuxt"]),
			],
		});

		expect(result.flags.some((f) => f.id === "limited-engagement")).toBe(true);
	});
});
