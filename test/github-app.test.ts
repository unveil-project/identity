import { describe, expect, it } from "vitest";
import { isGitHubAppAccount } from "../src/github-app";
import { identify } from "../src/identify";
import type { GitHubEvent } from "../src/types";
import { event, user } from "./utils/events";

function withActor(e: GitHubEvent, actor: { login: string; type?: string }) {
	return { ...e, actor } as unknown as GitHubEvent;
}

describe("isGitHubAppAccount", () => {
	it("uses the type GitHub reports on the user", () => {
		expect(
			isGitHubAppAccount(user({ login: "coderabbitai[bot]", type: "Bot" })),
		).toBe(true);
		expect(isGitHubAppAccount(user({ login: "octocat", type: "User" }))).toBe(
			false,
		);
	});

	it("recognises the [bot] login suffix when type was not fetched", () => {
		expect(isGitHubAppAccount(user({ login: "dependabot[bot]" }))).toBe(true);
		expect(isGitHubAppAccount(user({ login: "CodeRabbitAI[BOT]" }))).toBe(true);
	});

	it("does not match people whose name merely contains bot", () => {
		expect(isGitHubAppAccount(user({ login: "lendermatch-ci-bot" }))).toBe(
			false,
		);
		expect(isGitHubAppAccount(user({ login: "robotnik" }))).toBe(false);
	});

	it("reads the actor type on events when the user object lacks it", () => {
		const events = [
			withActor(event("PushEvent", "2025-06-01T10:00:00Z", "acme/app"), {
				login: "renovate",
				type: "Bot",
			}),
		];

		expect(isGitHubAppAccount(user({ login: "renovate" }), events)).toBe(true);
	});

	it("ignores bot actors that are not the account being analysed", () => {
		const events = [
			withActor(event("PushEvent", "2025-06-01T10:00:00Z", "acme/app"), {
				login: "someone-else[bot]",
				type: "Bot",
			}),
		];

		expect(isGitHubAppAccount(user({ login: "octocat" }), events)).toBe(false);
	});
});

describe("identify - GitHub App flag", () => {
	it("reports apps without changing the behavioural score", () => {
		const events = [
			event("PullRequestEvent", "2025-06-01T10:00:00Z", "acme/app", {
				action: "opened",
			}),
		];

		const app = identify({
			user: user({ login: "coderabbitai[bot]", type: "Bot" }),
			events,
		});
		const human = identify({ user: user({ login: "octocat" }), events });

		expect(app.isGitHubApp).toBe(true);
		expect(human.isGitHubApp).toBe(false);
		expect(app.score).toBe(human.score);
	});
});
