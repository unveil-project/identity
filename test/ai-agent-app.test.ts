import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONFIG } from "../src/config";
import type { GitHubEvent } from "../src/providers/github";
import { event, reportGitHub, user } from "./utils/events";

const dev = user({ login: "dev", created_at: "2025-01-01T00:00:00Z", public_repos: 20 });

/**
 * Twenty days of calm work on the account's own project, with one comment a
 * day: it scores organic.
 */
function calmWork(): GitHubEvent[] {
	const events: GitHubEvent[] = [];
	for (let day = 0; day < 20; day++) {
		events.push(
			event("PushEvent", new Date(Date.UTC(2026, 1, 10 + day, 14)).toISOString(), "dev/project"),
			event("IssueCommentEvent", new Date(Date.UTC(2026, 1, 10 + day, 15)).toISOString(), "dev/project"),
		);
	}
	return events;
}

/** Comments that an app posted for the account, one a day. */
function commentsVia(app: string, count: number): GitHubEvent[] {
	return Array.from({ length: count }, (_, i) =>
		event(
			"IssueCommentEvent",
			new Date(Date.UTC(2026, 1, 10 + i, 18)).toISOString(),
			"other/project",
			{ action: "created", comment: { performed_via_github_app: { slug: app } } },
		),
	);
}

/** Ten forks in ten hours: spam that the fork check catches. */
function forkSpam(): GitHubEvent[] {
	return Array.from({ length: 10 }, (_, i) =>
		event("ForkEvent", new Date(Date.UTC(2026, 2, 5, i)).toISOString(), `owner${i}/repo`),
	);
}

describe("report - Comments and issues by an AI agent", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(Date.UTC(2026, 2, 10, 12)));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("keeps an account that used an AI agent more than once out of organic", () => {
		const result = reportGitHub({
			user: dev,
			events: [...calmWork(), ...commentsVia("chatgpt-codex-connector", 2)],
		});

		const flag = result.flags.find((f) => f.id === "ai-agent-app");
		expect(flag?.facts).toEqual({
			posts: 2,
			allPosts: 22,
			apps: ["chatgpt-codex-connector"],
		});
		expect(flag?.label).toBe("Posts through an AI agent");
		expect(flag?.detail).toBe(
			"Codex posted 2 of the account's 22 comments and issues (9%)",
		);
		expect(result.classification).toBe("mixed");
		expect(result.score).toBe(CONFIG.THRESHOLD_HUMAN - 1);
	});

	it("does not count a single agent post: it can be a trial", () => {
		const result = reportGitHub({
			user: dev,
			events: [...calmWork(), ...commentsVia("claude", 1)],
		});

		expect(result.flags.some((f) => f.id === "ai-agent-app")).toBe(false);
		expect(result.classification).toBe("organic");
	});

	it("does not call many calm agent posts automation", () => {
		const result = reportGitHub({
			user: dev,
			events: [...calmWork(), ...commentsVia("claude", 15)],
		});

		const flag = result.flags.find((f) => f.id === "ai-agent-app");
		expect(flag?.facts).toEqual({ posts: 15, allPosts: 35, apps: ["claude"] });
		expect(result.classification).toBe("mixed");
	});

	it("ignores apps that are not AI agents", () => {
		const result = reportGitHub({
			user: dev,
			events: [...calmWork(), ...commentsVia("linear-code", 2)],
		});

		expect(result.flags.some((f) => f.id === "ai-agent-app")).toBe(false);
		expect(result.classification).toBe("organic");
	});

	it("leaves spam to the other checks", () => {
		const withOtherApp = reportGitHub({
			user: dev,
			events: [...calmWork(), ...forkSpam(), ...commentsVia("linear-code", 2)],
		});
		const withAgent = reportGitHub({
			user: dev,
			events: [...calmWork(), ...forkSpam(), ...commentsVia("claude", 2)],
		});

		expect(withAgent.flags.some((f) => f.id === "ai-agent-app")).toBe(true);
		expect(withAgent.classification).toBe("automation");
		expect(withAgent.score).toBe(withOtherApp.score);
	});
});
