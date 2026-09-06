import { describe, expect, it } from "vitest";
import { isGitHubAppAccount } from "../src/github-app";
import { identify } from "../src/identify";
import { event, user } from "./utils/events";


describe("isGitHubAppAccount", () => {
	it("uses the type GitHub reports on the user", () => {
		expect(
			isGitHubAppAccount(user({ login: "coderabbitai[bot]", type: "Bot" })),
		).toBe(true);
		expect(isGitHubAppAccount(user({ login: "octocat", type: "User" }))).toBe(
			false,
		);
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
