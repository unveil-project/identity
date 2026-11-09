import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GitHubEvent } from "../src/providers/github";
import { event, reportGitHub, user } from "./utils/events";

/** A comment on an issue, then a PR to the same repo two minutes later. */
function commentThenPR(repos: string[]): GitHubEvent[] {
	return repos.flatMap((repo, i) => {
		const commentAt = Date.UTC(2026, 5, 10 + i, 14);

		return [
			event("IssueCommentEvent", new Date(commentAt).toISOString(), repo, {
				action: "created",
			}),
			event(
				"PullRequestEvent",
				new Date(commentAt + 2 * 60_000).toISOString(),
				repo,
				{ action: "opened" },
			),
		];
	});
}

function hasFastCommentToPR(events: GitHubEvent[]): boolean {
	const result = reportGitHub({
		user: user({ login: "dev", created_at: "2018-01-01T00:00:00Z" }),
		events,
	});

	return result.flags.some((f) => f.id === "comment-pr-fast");
}

describe("issue comment followed by a fast PR", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("flags an outsider who claims issues and submits PRs within minutes", () => {
		expect(hasFastCommentToPR(commentThenPR(["acme/api", "globex/ui"]))).toBe(
			true,
		);
	});

	it("does not flag a maintainer working in their own repositories", () => {
		expect(hasFastCommentToPR(commentThenPR(["dev/api", "dev/ui"]))).toBe(
			false,
		);
	});

	it("does not flag a collaborator in repositories they push to", () => {
		// Pushing straight into acme's repos takes write access a maintainer granted.
		const pushes = ["acme/api", "acme/ui"].map((repo) =>
			event("PushEvent", "2026-06-01T09:00:00Z", repo),
		);

		expect(
			hasFastCommentToPR([...pushes, ...commentThenPR(["acme/api", "acme/ui"])]),
		).toBe(false);
	});
});
