import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isBountyRepo } from "../src/data/bounty-repos";
import { event, reportGitHub, user } from "./utils/events";

describe("isBountyRepo", () => {
	it("matches a listed repository in any letter case", () => {
		expect(isBountyRepo("SolFoundry/solfoundry")).toBe(true);
		expect(isBountyRepo("solfoundry/SOLFOUNDRY")).toBe(true);
	});

	it("matches a new copy of a campaign repository under any owner", () => {
		// "zeroeye" is listed under many throwaway accounts: a new copy counts
		// before anyone adds it to the list.
		expect(isBountyRepo("brand-new-account/zeroeye")).toBe(true);
	});

	it("does not match a real project because a fake copy took its name", () => {
		// Fake copies named "Vault", "Gitea" and "Traefik" are listed, but only
		// with their own owners. The real projects are not bounty repos.
		expect(isBountyRepo("hashicorp/vault")).toBe(false);
		expect(isBountyRepo("go-gitea/gitea")).toBe(false);
		expect(isBountyRepo("traefik/traefik")).toBe(false);
	});

	it("does not match a common repository name", () => {
		expect(isBountyRepo("someone/universe")).toBe(false);
		expect(isBountyRepo("someone/website")).toBe(false);
	});
});

describe("bounty hunters", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function openedPRs(repo: string) {
		return Array.from({ length: 4 }, (_, i) =>
			event(
				"PullRequestEvent",
				new Date(Date.UTC(2026, 5, 2 + i * 5, 10)).toISOString(),
				repo,
				{ action: "opened" },
			),
		);
	}

	it("marks an account that sends PRs to a campaign copy", () => {
		const result = reportGitHub({
			user: user({ created_at: "2020-01-01T00:00:00Z" }),
			events: openedPRs("brand-new-account/zeroeye"),
		});

		expect(result.isBountyHunter).toBe(true);
	});

	it("does not mark a contributor to a real project with a copied name", () => {
		const result = reportGitHub({
			user: user({ created_at: "2020-01-01T00:00:00Z" }),
			events: openedPRs("hashicorp/vault"),
		});

		expect(result.isBountyHunter).toBe(false);
	});
});
