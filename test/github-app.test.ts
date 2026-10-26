import { describe, expect, it } from "vitest";
import { isGitHubAppAccount } from "../src/providers/github";
import { event, reportGitHub, user } from "./utils/events";


describe("isGitHubAppAccount", () => {
	it("uses the type GitHub reports on the user", () => {
		expect(
			isGitHubAppAccount(user({ login: "coderabbitai[bot]", type: "Bot" })),
		).toBe(true);
		expect(isGitHubAppAccount(user({ login: "octocat", type: "User" }))).toBe(
			false,
		);
	});

	it("uses the type GitHub reports on event actors", () => {
		const events = [
			{
				...event("PushEvent", "2025-06-01T10:00:00Z", "acme/app"),
				actor: { login: "coderabbitai[bot]", type: "Bot" },
			},
		];
		expect(isGitHubAppAccount(user({ login: "coderabbitai[bot]" }), events)).toBe(
			true,
		);
		expect(
			reportGitHub({ user: user({ login: "coderabbitai[bot]" }), events })
				.isGitHubApp,
		).toBe(true);
	});
});

describe("report - GitHub App flag", () => {
	it("reports apps without changing the behavioural score", () => {
		const events = [
			event("PullRequestEvent", "2025-06-01T10:00:00Z", "acme/app", {
				action: "opened",
			}),
		];

		const app = reportGitHub({
			user: user({ login: "coderabbitai[bot]", type: "Bot" }),
			events,
		});
		const human = reportGitHub({ user: user({ login: "octocat" }), events });

		expect(app.isGitHubApp).toBe(true);
		expect(human.isGitHubApp).toBe(false);
		expect(app.score).toBe(human.score);
	});
});
