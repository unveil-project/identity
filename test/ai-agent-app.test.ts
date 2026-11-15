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

const CLAUDE_FOOTER =
	"Looks good.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)";

/** Branches the account created on 5 March, `minutesApart` minutes apart. */
function branches(names: string[], minutesApart = 10): GitHubEvent[] {
	return names.map((name, i) =>
		event(
			"CreateEvent",
			new Date(Date.UTC(2026, 2, 5, 0, i * minutesApart)).toISOString(),
			"dev/project",
			{ ref_type: "branch", ref: name },
		),
	);
}

function aiBranchNames(count: number): string[] {
	return Array.from({ length: count }, (_, i) => `codex/task-${i}`);
}

/** Comments in one repo, one a minute from 5 March. */
function commentsWith(
	count: number,
	comment: Record<string, unknown>,
): GitHubEvent[] {
	return Array.from({ length: count }, (_, i) =>
		event(
			"IssueCommentEvent",
			new Date(Date.UTC(2026, 2, 5, 0, i)).toISOString(),
			"other/project",
			{ action: "created", comment },
		),
	);
}

function flagOf(result: ReturnType<typeof reportGitHub>, id: string) {
	return result.flags.find((f) => f.id === id);
}

describe("report - AI agent branches", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(Date.UTC(2026, 2, 10, 12)));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("does not count a single AI agent branch: it can be a trial", () => {
		const result = reportGitHub({
			user: dev,
			events: [...calmWork(), ...branches(["codex/fix"])],
		});

		expect(flagOf(result, "ai-branch-prefix")).toBeUndefined();
		expect(result.classification).toBe("organic");
	});

	it("keeps an account with 2 AI agent branches out of 50 out of organic", () => {
		const humanBranches = Array.from({ length: 48 }, (_, i) => `fix-${i}`);
		const result = reportGitHub({
			user: dev,
			events: [
				...calmWork(),
				...branches([...humanBranches, "codex/a", "codex/b"], 60),
			],
		});

		expect(flagOf(result, "ai-branch-prefix")?.points).toBe(0);
		expect(result.score).toBe(CONFIG.THRESHOLD_HUMAN - 1);
	});

	it("knows Claude Code branches", () => {
		const result = reportGitHub({
			user: dev,
			events: [
				...calmWork(),
				...branches(["claude/x-abc123", "claude/y-def456"]),
			],
		});

		expect(flagOf(result, "ai-branch-prefix")?.facts).toMatchObject({
			prefixes: ["claude/"],
		});
	});
});

describe("report - Heavy AI agent use", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(Date.UTC(2026, 2, 10, 12)));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function branchVolumePoints(count: number, minutesApart = 10) {
		const result = reportGitHub({
			user: dev,
			events: [...calmWork(), ...branches(aiBranchNames(count), minutesApart)],
		});

		return flagOf(result, "ai-branch-volume")?.points;
	}

	function postVolume(comment: Record<string, unknown>, count: number) {
		const result = reportGitHub({
			user: dev,
			events: [...calmWork(), ...commentsWith(count, comment)],
		});

		return flagOf(result, "ai-post-volume");
	}

	it("gives AI agent branches points by the busiest day", () => {
		expect(branchVolumePoints(8)).toBeUndefined();
		expect(branchVolumePoints(16)).toBe(CONFIG.POINTS_AI_BRANCHES_DAY_HEAVY);
		expect(branchVolumePoints(30)).toBe(CONFIG.POINTS_AI_BRANCHES_DAY_EXTREME);
		expect(branchVolumePoints(40)).toBe(CONFIG.POINTS_AI_BRANCHES_DAY_EXTREME);
	});

	it("ignores AI agent branches spread over a few days", () => {
		// 16 branches over 3 days: about 5 a day.
		expect(branchVolumePoints(16, 4.5 * 60)).toBeUndefined();
	});

	it("gives AI agent posts points by the busiest day, even in one repo", () => {
		const viaAgent = { performed_via_github_app: { slug: "claude" } };

		expect(postVolume(viaAgent, 40)).toBeUndefined();
		expect(postVolume(viaAgent, 60)?.points).toBe(
			CONFIG.POINTS_AI_POSTS_DAY_HEAVY,
		);
		expect(postVolume(viaAgent, 120)?.points).toBe(
			CONFIG.POINTS_AI_POSTS_DAY_EXTREME,
		);
	});

	it("does not count posts that only mention an AI tool in their text", () => {
		expect(postVolume({ body: CLAUDE_FOOTER }, 120)).toBeUndefined();
	});
});

describe("report - AI footers in text", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(Date.UTC(2026, 2, 10, 12)));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("does not read the text of posts: an AI footer alone stays organic", () => {
		// Text is too easy to misread, so only facts from GitHub count.
		const result = reportGitHub({
			user: dev,
			events: [...calmWork(), ...commentsWith(5, { body: CLAUDE_FOOTER })],
		});

		expect(result.flags.some((f) => f.group === "ai-attribution")).toBe(false);
		expect(result.classification).toBe("organic");
	});
});
