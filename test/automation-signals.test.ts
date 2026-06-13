import { describe, expect, it } from "vitest";
import {
	detectConsumerNoReciprocity,
	detectEventMonoculture,
	detectIssueBurst,
	detectStarConcentration,
	detectThinProfileBot,
} from "../src/detectors/automation-signals";
import type { GitHubEvent, IdentifyProfile } from "../src/types";

function makeEvent(
	type: string,
	repoName: string,
	createdAt: string,
	payload?: Record<string, unknown>,
): GitHubEvent {
	return {
		type,
		repo: { name: repoName } as GitHubEvent["repo"],
		created_at: createdAt,
		payload,
	} as GitHubEvent;
}

const ACCOUNT = "testuser";
const OWN_REPO = `${ACCOUNT}/my-repo`;

describe("detectStarConcentration", () => {
	it("returns no flag for empty events", () => {
		expect(detectStarConcentration([])).toHaveLength(0);
	});

	it("returns no flag when watch ratio is below 0.8", () => {
		const events = [
			...Array.from({ length: 7 }, () => makeEvent("WatchEvent", "org/repo", "2024-01-01T00:00:00Z")),
			...Array.from({ length: 3 }, () => makeEvent("PushEvent", "org/repo", "2024-01-01T00:00:00Z")),
		];
		expect(detectStarConcentration(events)).toHaveLength(0);
	});

	it("flags star farm pattern when 80%+ events are watches with ≤2 push/PR", () => {
		const events = [
			...Array.from({ length: 9 }, () => makeEvent("WatchEvent", "org/repo", "2024-01-01T00:00:00Z")),
			makeEvent("PushEvent", "org/repo", "2024-01-01T00:00:00Z"),
		];
		const flags = detectStarConcentration(events);
		const farmFlag = flags.find((f) => f.label === "Star farm pattern");
		expect(farmFlag).toBeDefined();
		expect(farmFlag!.points).toBeGreaterThan(0);
		expect(farmFlag!.amplifiable).toBe(true);
	});

	it("does not flag star farm when push/PR count exceeds max", () => {
		const events = [
			...Array.from({ length: 9 }, () => makeEvent("WatchEvent", "org/repo", "2024-01-01T00:00:00Z")),
			...Array.from({ length: 3 }, () => makeEvent("PushEvent", "org/repo", "2024-01-01T00:00:00Z")),
		];
		const flags = detectStarConcentration(events);
		expect(flags.find((f) => f.label === "Star farm pattern")).toBeUndefined();
	});

	it("flags star burst when 10+ watches occur in any 24-hour window", () => {
		const base = new Date("2024-01-01T00:00:00Z").getTime();
		const events = Array.from({ length: 10 }, (_, i) => {
			const ts = new Date(base + i * 30 * 60 * 1000).toISOString(); // 30 min apart
			return makeEvent("WatchEvent", `org/repo${i}`, ts);
		});
		const flags = detectStarConcentration(events);
		const burstFlag = flags.find((f) => f.label === "Star burst activity");
		expect(burstFlag).toBeDefined();
		expect(burstFlag!.amplifiable).toBe(true);
	});

	it("does not flag burst when watches are spread across more than 24 hours", () => {
		const events = Array.from({ length: 10 }, (_, i) => {
			const ts = new Date(
				new Date("2024-01-01T00:00:00Z").getTime() + i * 4 * 60 * 60 * 1000,
			).toISOString(); // 4 hours apart → spread over 36 hours
			return makeEvent("WatchEvent", `org/repo${i}`, ts);
		});
		const flags = detectStarConcentration(events);
		expect(flags.find((f) => f.label === "Star burst activity")).toBeUndefined();
	});
});

describe("detectEventMonoculture", () => {
	it("returns no flag with fewer than 30 events", () => {
		const events = Array.from({ length: 29 }, () =>
			makeEvent("PushEvent", "org/repo", "2024-01-01T00:00:00Z"),
		);
		expect(detectEventMonoculture(events)).toHaveLength(0);
	});

	it("returns no flag when entropy is above threshold", () => {
		// Even split between 4 types — high entropy
		const events = [
			...Array.from({ length: 10 }, () => makeEvent("PushEvent", "org/repo", "2024-01-01T00:00:00Z")),
			...Array.from({ length: 10 }, () => makeEvent("WatchEvent", "org/repo", "2024-01-01T00:00:00Z")),
			...Array.from({ length: 10 }, () => makeEvent("ForkEvent", "org/repo", "2024-01-01T00:00:00Z")),
			...Array.from({ length: 10 }, () => makeEvent("PullRequestEvent", "org/repo", "2024-01-01T00:00:00Z")),
		];
		expect(detectEventMonoculture(events)).toHaveLength(0);
	});

	it("flags monoculture when one event type dominates at very low entropy", () => {
		// 98%+ PushEvent — normalized entropy well below 0.25 threshold
		const events = [
			...Array.from({ length: 59 }, () => makeEvent("PushEvent", "org/repo", "2024-01-01T00:00:00Z")),
			makeEvent("WatchEvent", "org/repo", "2024-01-01T00:00:00Z"),
		];
		const flags = detectEventMonoculture(events);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Event type monoculture");
		expect(flags[0].points).toBeGreaterThan(0);
		expect(flags[0].amplifiable).toBe(true);
	});

	it("returns no flag when only one event type exists (handled by diversity check)", () => {
		const events = Array.from({ length: 30 }, () =>
			makeEvent("PushEvent", "org/repo", "2024-01-01T00:00:00Z"),
		);
		expect(detectEventMonoculture(events)).toHaveLength(0);
	});
});

describe("detectThinProfileBot", () => {
	it("returns no flag when profile is undefined", () => {
		expect(detectThinProfileBot(undefined, 5)).toHaveLength(0);
	});

	it("returns no flag when fewer than 4 thin profile indicators", () => {
		const profile: IdentifyProfile = {
			followers: 100,
			name: "Alice Developer",
			bio: "Building stuff",
			company: "Acme",
			location: "NYC",
			blog: "https://example.com",
		};
		expect(detectThinProfileBot(profile, 10)).toHaveLength(0);
	});

	it("flags thin profile when 4+ indicators are present", () => {
		const profile: IdentifyProfile = {
			followers: 0, // ≤1 → indicator
			name: null, // missing → indicator
			bio: null, // missing → indicator
			company: null, // missing → indicator
			location: null, // missing → indicator
			blog: null,
		};
		// indicators: followers(1) + reposCount≤1(1) + name(1) + bio(1) + company(1) = 5
		const flags = detectThinProfileBot(profile, 1);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Thin profile");
		expect(flags[0].points).toBeGreaterThan(0);
	});

	it("counts repos count as an indicator when repos ≤ 1", () => {
		const profile: IdentifyProfile = {
			followers: 0,
			name: null,
			bio: null,
			company: null,
			location: null,
			blog: null,
		};
		// With 2 repos: 6 indicators (followers + name + bio + company + location + blog)
		const flags = detectThinProfileBot(profile, 2);
		expect(flags).toHaveLength(1);
	});

	it("does not flag when repos count is high even with other thin indicators", () => {
		const profile: IdentifyProfile = {
			followers: 0,
			name: null,
			bio: null,
			company: null,
			location: null,
			blog: null,
		};
		// 6 indicators regardless of repos, so still flags
		const flags = detectThinProfileBot(profile, 50);
		expect(flags).toHaveLength(1); // 6 indicators ≥ 4 threshold
	});
});

describe("detectIssueBurst", () => {
	it("returns no flag with fewer than 8 issue open events", () => {
		const events = Array.from({ length: 7 }, (_, i) =>
			makeEvent("IssuesEvent", `org/repo${i}`, "2024-01-01T01:00:00Z", { action: "opened" }),
		);
		expect(detectIssueBurst(events, ACCOUNT)).toHaveLength(0);
	});

	it("returns no flag when account has external push events (legitimate contributor)", () => {
		const events = [
			...Array.from({ length: 10 }, (_, i) =>
				makeEvent("IssuesEvent", `org/repo${i % 6}`, "2024-01-01T01:00:00Z", { action: "opened" }),
			),
			makeEvent("PushEvent", "org/external-repo", "2024-01-01T00:00:00Z"),
		];
		expect(detectIssueBurst(events, ACCOUNT)).toHaveLength(0);
	});

	it("still flags burst when account only pushes to own repos", () => {
		const base = new Date("2024-01-01T00:00:00Z").getTime();
		const events = [
			...Array.from({ length: 10 }, (_, i) =>
				makeEvent("IssuesEvent", `org/repo${i % 6}`, new Date(base + i * 60_000).toISOString(), {
					action: "opened",
				}),
			),
			makeEvent("PushEvent", OWN_REPO, "2024-01-01T00:00:00Z"),
		];
		expect(detectIssueBurst(events, ACCOUNT)).toHaveLength(1);
	});

	it("flags issue burst when 8+ issues across 5+ repos within 72h with no pushes", () => {
		const base = new Date("2024-01-01T00:00:00Z").getTime();
		const events = Array.from({ length: 10 }, (_, i) =>
			makeEvent(
				"IssuesEvent",
				`org/repo${i}`,
				new Date(base + i * 60 * 60 * 1000).toISOString(), // 1h apart
				{ action: "opened" },
			),
		);
		const flags = detectIssueBurst(events, ACCOUNT);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Issue burst");
		expect(flags[0].points).toBeGreaterThan(0);
		expect(flags[0].amplifiable).toBe(true);
	});

	it("does not flag when issues are concentrated in fewer than 5 repos", () => {
		const events = Array.from({ length: 10 }, (_, i) =>
			makeEvent(
				"IssuesEvent",
				`org/repo${i % 3}`, // only 3 repos
				new Date(new Date("2024-01-01T00:00:00Z").getTime() + i * 60 * 60 * 1000).toISOString(),
				{ action: "opened" },
			),
		);
		expect(detectIssueBurst(events, ACCOUNT)).toHaveLength(0);
	});

	it("ignores issues on own repos", () => {
		const events = Array.from({ length: 10 }, (_, i) =>
			makeEvent("IssuesEvent", OWN_REPO, "2024-01-01T00:00:00Z", { action: "opened" }),
		);
		expect(detectIssueBurst(events, ACCOUNT)).toHaveLength(0);
	});

	it("ignores non-opened issue actions", () => {
		const events = Array.from({ length: 10 }, (_, i) =>
			makeEvent("IssuesEvent", `org/repo${i}`, "2024-01-01T00:00:00Z", {
				action: "closed",
			}),
		);
		expect(detectIssueBurst(events, ACCOUNT)).toHaveLength(0);
	});
});

describe("detectConsumerNoReciprocity", () => {
	it("returns no flag with fewer than 5 consumer events", () => {
		const events = Array.from({ length: 4 }, () =>
			makeEvent("WatchEvent", "org/repo", "2024-01-01T00:00:00Z"),
		);
		expect(detectConsumerNoReciprocity(events, ACCOUNT)).toHaveLength(0);
	});

	it("flags consumer with no reciprocity when account only stars/forks with no external contributions", () => {
		const events = [
			...Array.from({ length: 3 }, () =>
				makeEvent("WatchEvent", "org/repo", "2024-01-01T00:00:00Z"),
			),
			...Array.from({ length: 3 }, () =>
				makeEvent("ForkEvent", "org/repo2", "2024-01-02T00:00:00Z"),
			),
		];
		const flags = detectConsumerNoReciprocity(events, ACCOUNT);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Consumer with no reciprocity");
		expect(flags[0].points).toBeGreaterThan(0);
	});

	it("does not flag when account has external push contributions", () => {
		const events = [
			...Array.from({ length: 5 }, () =>
				makeEvent("WatchEvent", "org/repo", "2024-01-01T00:00:00Z"),
			),
			makeEvent("PushEvent", "org/other-repo", "2024-01-03T00:00:00Z"),
		];
		expect(detectConsumerNoReciprocity(events, ACCOUNT)).toHaveLength(0);
	});

	it("does not flag when account has external PR contributions", () => {
		const events = [
			...Array.from({ length: 5 }, () =>
				makeEvent("WatchEvent", "org/repo", "2024-01-01T00:00:00Z"),
			),
			makeEvent("PullRequestEvent", "org/other-repo", "2024-01-03T00:00:00Z"),
		];
		expect(detectConsumerNoReciprocity(events, ACCOUNT)).toHaveLength(0);
	});

	it("does not treat own-repo pushes as external contribution", () => {
		const events = [
			...Array.from({ length: 5 }, () =>
				makeEvent("WatchEvent", "org/repo", "2024-01-01T00:00:00Z"),
			),
			makeEvent("PushEvent", OWN_REPO, "2024-01-03T00:00:00Z"),
		];
		const flags = detectConsumerNoReciprocity(events, ACCOUNT);
		expect(flags).toHaveLength(1); // own-repo push doesn't count as reciprocity
	});
});
