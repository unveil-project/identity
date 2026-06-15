import { describe, expect, it } from "vitest";
import {
	detectDayOfWeekVariance,
	detectDormancyGap,
	detectFollowerCount,
	detectGistActivity,
	detectIdentityCompleteness,
	detectLongSpanEngagement,
	detectMergedContributions,
	detectPRIterationCycles,
	detectPreAiHistory,
	detectReviewActivity,
	detectReviewCommentActivity,
} from "../src/detectors/human-signals";
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

function makeMergedPREvent(repoName: string, createdAt: string): GitHubEvent {
	return makeEvent("PullRequestEvent", repoName, createdAt, {
		action: "closed",
		pull_request: { merged: true },
	});
}

function makeSyncPREvent(repoName: string, createdAt: string): GitHubEvent {
	return makeEvent("PullRequestEvent", repoName, createdAt, {
		action: "synchronize",
	});
}

const ACCOUNT = "testuser";
const OWN_REPO = `${ACCOUNT}/my-repo`;
describe("detectMergedContributions", () => {
	it("returns no flag when below minimum repos", () => {
		const events = [
			makeMergedPREvent("org/repo1", "2024-01-01T00:00:00Z"),
			makeMergedPREvent("org/repo2", "2024-01-02T00:00:00Z"),
		];
		expect(detectMergedContributions(events, ACCOUNT)).toHaveLength(0);
	});

	it("flags base tier at 3+ distinct external repos with merged PRs", () => {
		const events = [
			makeMergedPREvent("org/repo1", "2024-01-01T00:00:00Z"),
			makeMergedPREvent("org/repo2", "2024-01-02T00:00:00Z"),
			makeMergedPREvent("org/repo3", "2024-01-03T00:00:00Z"),
		];
		const flags = detectMergedContributions(events, ACCOUNT);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("External contributor");
		expect(flags[0].points).toBeLessThan(0);
	});

	it("flags high tier at 8+ distinct external repos", () => {
		const events = Array.from({ length: 8 }, (_, i) =>
			makeMergedPREvent(`org/repo${i}`, "2024-01-01T00:00:00Z"),
		);
		const flags = detectMergedContributions(events, ACCOUNT);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Established contributor");
		expect(flags[0].points).toBeLessThanOrEqual(-10);
	});

	it("deduplicates repos — multiple merged PRs in same repo count once", () => {
		const events = [
			makeMergedPREvent("org/repo1", "2024-01-01T00:00:00Z"),
			makeMergedPREvent("org/repo1", "2024-01-10T00:00:00Z"),
			makeMergedPREvent("org/repo2", "2024-01-02T00:00:00Z"),
		];
		const flags = detectMergedContributions(events, ACCOUNT);
		expect(flags).toHaveLength(0);
	});

	it("ignores own repos", () => {
		const events = [
			makeMergedPREvent(OWN_REPO, "2024-01-01T00:00:00Z"),
			makeMergedPREvent("org/repo1", "2024-01-01T00:00:00Z"),
			makeMergedPREvent("org/repo2", "2024-01-01T00:00:00Z"),
		];
		// 1 own + 2 external — below the 3-repo threshold
		const flags = detectMergedContributions(events, ACCOUNT);
		expect(flags).toHaveLength(0);
	});

	it("ignores unmerged closed PRs", () => {
		const events = Array.from({ length: 5 }, (_, i) =>
			makeEvent("PullRequestEvent", `org/repo${i}`, "2024-01-01T00:00:00Z", {
				action: "closed",
				pull_request: { merged: false },
			}),
		);
		expect(detectMergedContributions(events, ACCOUNT)).toHaveLength(0);
	});

	it("accepts action=merged (GitHub Events API format) as merged", () => {
		const events = Array.from({ length: 3 }, (_, i) =>
			makeEvent("PullRequestEvent", `org/repo${i}`, "2024-01-01T00:00:00Z", {
				action: "merged",
			}),
		);
		const flags = detectMergedContributions(events, ACCOUNT);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("External contributor");
	});
});

describe("detectReviewActivity", () => {
	it("returns no flag below 5 external reviews", () => {
		const events = Array.from({ length: 4 }, () =>
			makeEvent("PullRequestReviewEvent", "org/repo", "2024-01-01T00:00:00Z"),
		);
		expect(detectReviewActivity(events, ACCOUNT)).toHaveLength(0);
	});

	it("flags base tier at 5+ external reviews", () => {
		const events = Array.from({ length: 5 }, () =>
			makeEvent("PullRequestReviewEvent", "org/repo", "2024-01-01T00:00:00Z"),
		);
		const flags = detectReviewActivity(events, ACCOUNT);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Code reviewer");
		expect(flags[0].points).toBeLessThan(0);
	});

	it("flags high tier at 15+ external reviews", () => {
		const events = Array.from({ length: 15 }, () =>
			makeEvent("PullRequestReviewEvent", "org/repo", "2024-01-01T00:00:00Z"),
		);
		const flags = detectReviewActivity(events, ACCOUNT);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Active code reviewer");
		expect(flags[0].points).toBeLessThanOrEqual(-10);
	});

	it("excludes reviews on own repos", () => {
		const events = Array.from({ length: 10 }, () =>
			makeEvent("PullRequestReviewEvent", OWN_REPO, "2024-01-01T00:00:00Z"),
		);
		expect(detectReviewActivity(events, ACCOUNT)).toHaveLength(0);
	});
});

describe("detectReviewCommentActivity", () => {
	it("returns no flag below 3 external review comments", () => {
		const events = Array.from({ length: 2 }, () =>
			makeEvent("PullRequestReviewCommentEvent", "org/repo", "2024-01-01T00:00:00Z"),
		);
		expect(detectReviewCommentActivity(events, ACCOUNT)).toHaveLength(0);
	});

	it("flags base tier at 3+ external review comments", () => {
		const events = Array.from({ length: 3 }, () =>
			makeEvent("PullRequestReviewCommentEvent", "org/repo", "2024-01-01T00:00:00Z"),
		);
		const flags = detectReviewCommentActivity(events, ACCOUNT);
		expect(flags).toHaveLength(1);
		expect(flags[0].points).toBeLessThan(0);
	});

	it("flags high tier at 10+ external review comments", () => {
		const events = Array.from({ length: 10 }, () =>
			makeEvent("PullRequestReviewCommentEvent", "org/repo", "2024-01-01T00:00:00Z"),
		);
		const flags = detectReviewCommentActivity(events, ACCOUNT);
		expect(flags).toHaveLength(1);
		expect(flags[0].points).toBeLessThanOrEqual(-10);
	});

	it("excludes review comments on own repos", () => {
		const events = Array.from({ length: 10 }, () =>
			makeEvent("PullRequestReviewCommentEvent", OWN_REPO, "2024-01-01T00:00:00Z"),
		);
		expect(detectReviewCommentActivity(events, ACCOUNT)).toHaveLength(0);
	});
});

describe("detectDormancyGap", () => {
	it("returns no flag with fewer than 2 events", () => {
		expect(detectDormancyGap([])).toHaveLength(0);
		expect(detectDormancyGap([makeEvent("PushEvent", "org/repo", "2024-01-01T00:00:00Z")])).toHaveLength(0);
	});

	it("returns no flag when max gap is less than 30 days", () => {
		const events = [
			makeEvent("PushEvent", "org/repo", "2024-01-01T00:00:00Z"),
			makeEvent("PushEvent", "org/repo", "2024-01-20T00:00:00Z"),
		];
		expect(detectDormancyGap(events)).toHaveLength(0);
	});

	it("flags base dormancy at 30+ day gap", () => {
		const events = [
			makeEvent("PushEvent", "org/repo", "2024-01-01T00:00:00Z"),
			makeEvent("PushEvent", "org/repo", "2024-02-10T00:00:00Z"),
		];
		const flags = detectDormancyGap(events);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Dormancy gap");
		expect(flags[0].points).toBeLessThan(0);
	});

	it("flags extended dormancy at 60+ day gap", () => {
		const events = [
			makeEvent("PushEvent", "org/repo", "2024-01-01T00:00:00Z"),
			makeEvent("PushEvent", "org/repo", "2024-04-01T00:00:00Z"),
		];
		const flags = detectDormancyGap(events);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Extended dormancy period");
		expect(flags[0].points).toBeLessThanOrEqual(-10);
	});

	it("finds the largest gap across multiple intervals", () => {
		const events = [
			makeEvent("PushEvent", "org/repo", "2024-01-01T00:00:00Z"),
			makeEvent("PushEvent", "org/repo", "2024-01-05T00:00:00Z"),
			makeEvent("PushEvent", "org/repo", "2024-04-01T00:00:00Z"), // 86-day gap
		];
		const flags = detectDormancyGap(events);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Extended dormancy period");
	});
});

describe("detectGistActivity", () => {
	it("returns no flag with no gist events", () => {
		const events = [makeEvent("PushEvent", "org/repo", "2024-01-01T00:00:00Z")];
		expect(detectGistActivity(events)).toHaveLength(0);
	});

	it("flags gist activity when a GistEvent is present", () => {
		const events = [
			makeEvent("PushEvent", "org/repo", "2024-01-01T00:00:00Z"),
			makeEvent("GistEvent", "gist", "2024-01-02T00:00:00Z"),
		];
		const flags = detectGistActivity(events);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Gist activity");
		expect(flags[0].points).toBeLessThan(0);
	});
});

describe("detectPRIterationCycles", () => {
	it("returns no flag below 2 external repos with sync events", () => {
		const events = [makeSyncPREvent("org/repo1", "2024-01-01T00:00:00Z")];
		expect(detectPRIterationCycles(events, ACCOUNT)).toHaveLength(0);
	});

	it("flags base tier at 2+ repos with synchronize events", () => {
		const events = [
			makeSyncPREvent("org/repo1", "2024-01-01T00:00:00Z"),
			makeSyncPREvent("org/repo2", "2024-01-02T00:00:00Z"),
		];
		const flags = detectPRIterationCycles(events, ACCOUNT);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Iterated contributions");
		expect(flags[0].points).toBeLessThan(0);
	});

	it("flags high tier at 5+ repos with synchronize events", () => {
		const events = Array.from({ length: 5 }, (_, i) =>
			makeSyncPREvent(`org/repo${i}`, "2024-01-01T00:00:00Z"),
		);
		const flags = detectPRIterationCycles(events, ACCOUNT);
		expect(flags).toHaveLength(1);
		expect(flags[0].points).toBeLessThanOrEqual(-10);
	});

	it("ignores own repos", () => {
		const events = Array.from({ length: 5 }, () =>
			makeSyncPREvent(OWN_REPO, "2024-01-01T00:00:00Z"),
		);
		expect(detectPRIterationCycles(events, ACCOUNT)).toHaveLength(0);
	});
});

describe("detectLongSpanEngagement", () => {
	it("returns no flag with fewer than 2 repos with 120+ day span", () => {
		const events = [
			makeEvent("PushEvent", "org/repo1", "2024-01-01T00:00:00Z"),
			makeEvent("PushEvent", "org/repo1", "2024-03-01T00:00:00Z"), // 60 days — under threshold
		];
		expect(detectLongSpanEngagement(events, ACCOUNT)).toHaveLength(0);
	});

	it("flags base tier when 2 external repos have 120+ day engagement span", () => {
		const events = [
			makeEvent("PushEvent", "org/repo1", "2024-01-01T00:00:00Z"),
			makeEvent("PushEvent", "org/repo1", "2024-07-01T00:00:00Z"), // ~182 days
			makeEvent("PushEvent", "org/repo2", "2024-01-01T00:00:00Z"),
			makeEvent("PushEvent", "org/repo2", "2024-06-15T00:00:00Z"), // ~166 days
		];
		const flags = detectLongSpanEngagement(events, ACCOUNT);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Long-span engagement");
		expect(flags[0].points).toBeLessThan(0);
	});

	it("flags high tier when 4+ external repos have 120+ day span", () => {
		const repos = ["org/a", "org/b", "org/c", "org/d"];
		const events = repos.flatMap((repo) => [
			makeEvent("PushEvent", repo, "2024-01-01T00:00:00Z"),
			makeEvent("PushEvent", repo, "2024-08-01T00:00:00Z"),
		]);
		const flags = detectLongSpanEngagement(events, ACCOUNT);
		expect(flags).toHaveLength(1);
		expect(flags[0].points).toBeLessThanOrEqual(-10);
	});

	it("ignores own repos", () => {
		const events = [
			makeEvent("PushEvent", OWN_REPO, "2024-01-01T00:00:00Z"),
			makeEvent("PushEvent", OWN_REPO, "2024-09-01T00:00:00Z"),
		];
		expect(detectLongSpanEngagement(events, ACCOUNT)).toHaveLength(0);
	});
});

describe("detectDayOfWeekVariance", () => {
	it("returns no flag with fewer than 20 events", () => {
		const events = Array.from({ length: 19 }, (_, i) =>
			makeEvent("PushEvent", "org/repo", `2024-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`),
		);
		expect(detectDayOfWeekVariance(events)).toHaveLength(0);
	});

	it("flags natural activity rhythm when CV >= 0.3", () => {
		// Heavily weighted toward weekdays — high variance
		const events: GitHubEvent[] = [
			// Monday 2024-01-01 (10 events)
			...Array.from({ length: 10 }, () =>
				makeEvent("PushEvent", "org/repo", "2024-01-01T10:00:00Z"),
			),
			// Friday 2024-01-05 (8 events)
			...Array.from({ length: 8 }, () =>
				makeEvent("PushEvent", "org/repo", "2024-01-05T10:00:00Z"),
			),
			// Sunday 2024-01-07 (2 events)
			...Array.from({ length: 2 }, () =>
				makeEvent("PushEvent", "org/repo", "2024-01-07T10:00:00Z"),
			),
			// Saturday 2024-01-06 (1 event)
			makeEvent("PushEvent", "org/repo", "2024-01-06T10:00:00Z"),
		];
		const flags = detectDayOfWeekVariance(events);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Natural activity rhythm");
		expect(flags[0].points).toBeLessThan(0);
	});

	it("does not flag perfectly uniform activity", () => {
		// 21 events spread evenly across all 7 days (3 per day — CV=0)
		const dates = [
			"2024-01-01", // Mon
			"2024-01-02", // Tue
			"2024-01-03", // Wed
			"2024-01-04", // Thu
			"2024-01-05", // Fri
			"2024-01-06", // Sat
			"2024-01-07", // Sun
		];
		const events = dates.flatMap((d) =>
			Array.from({ length: 3 }, () =>
				makeEvent("PushEvent", "org/repo", `${d}T10:00:00Z`),
			),
		);
		const flags = detectDayOfWeekVariance(events);
		expect(flags).toHaveLength(0);
	});
});
describe("detectPreAiHistory", () => {
	it("returns no flag with fewer than 3 pre-AI repos", () => {
		const repos = [
			{ created_at: "2024-06-01T00:00:00Z" },
			{ created_at: "2023-03-15T00:00:00Z" },
		];
		expect(detectPreAiHistory(repos)).toHaveLength(0);
	});

	it("flags base tier with 3+ repos created before 2025", () => {
		const repos = Array.from({ length: 3 }, () => ({
			created_at: "2023-01-01T00:00:00Z",
		}));
		const flags = detectPreAiHistory(repos);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Pre-AI development history");
		expect(flags[0].points).toBeLessThan(0);
	});

	it("flags high tier with 8+ repos created before 2025", () => {
		const repos = Array.from({ length: 8 }, () => ({
			created_at: "2022-06-01T00:00:00Z",
		}));
		const flags = detectPreAiHistory(repos);
		expect(flags).toHaveLength(1);
		expect(flags[0].points).toBeLessThanOrEqual(-20);
	});

	it("does not count repos created on or after 2025-01-01", () => {
		const repos = Array.from({ length: 5 }, () => ({
			created_at: "2025-03-01T00:00:00Z",
		}));
		expect(detectPreAiHistory(repos)).toHaveLength(0);
	});

	it("correctly partitions repos across the cutoff date", () => {
		const repos = [
			{ created_at: "2024-12-31T23:59:59Z" }, // pre-AI
			{ created_at: "2025-01-01T00:00:00Z" }, // on cutoff — not counted
			{ created_at: "2023-06-01T00:00:00Z" }, // pre-AI
			{ created_at: "2022-01-01T00:00:00Z" }, // pre-AI
		];
		const flags = detectPreAiHistory(repos);
		expect(flags).toHaveLength(1);
		expect(flags[0].detail).toContain("3 repositories");
	});
});

describe("detectFollowerCount", () => {
	it("returns no flag when profile is undefined", () => {
		expect(detectFollowerCount(undefined)).toHaveLength(0);
	});

	it("returns no flag below 50 followers", () => {
		const profile: IdentifyProfile = {
			followers: 49,
			name: null,
			bio: null,
			company: null,
			location: null,
			blog: null,
		};
		expect(detectFollowerCount(profile)).toHaveLength(0);
	});

	it("flags base tier at 50+ followers", () => {
		const profile: IdentifyProfile = {
			followers: 50,
			name: null,
			bio: null,
			company: null,
			location: null,
			blog: null,
		};
		const flags = detectFollowerCount(profile);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Has followers");
		expect(flags[0].points).toBeLessThan(0);
	});

	it("flags high tier at 200+ followers", () => {
		const profile: IdentifyProfile = {
			followers: 200,
			name: null,
			bio: null,
			company: null,
			location: null,
			blog: null,
		};
		const flags = detectFollowerCount(profile);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Established following");
		expect(flags[0].points).toBeLessThanOrEqual(-10);
	});
});

describe("detectIdentityCompleteness", () => {
	it("returns no flag when profile is undefined", () => {
		expect(detectIdentityCompleteness(undefined)).toHaveLength(0);
	});

	it("returns no flag with fewer than 3 fields", () => {
		const profile: IdentifyProfile = {
			followers: 0,
			name: "Alice",
			bio: null,
			company: null,
			location: null,
			blog: null,
		};
		expect(detectIdentityCompleteness(profile)).toHaveLength(0);
	});

	it("does not count a bio shorter than 20 characters", () => {
		const profile: IdentifyProfile = {
			followers: 0,
			name: "Alice",
			bio: "Short",
			company: "Acme",
			location: null,
			blog: null,
		};
		// name + company = 2, bio too short = not counted → below threshold
		expect(detectIdentityCompleteness(profile)).toHaveLength(0);
	});

	it("flags base tier with 3 valid fields", () => {
		const profile: IdentifyProfile = {
			followers: 0,
			name: "Alice",
			company: "Acme Corp",
			location: "Berlin",
			bio: null,
			blog: null,
		};
		const flags = detectIdentityCompleteness(profile);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Partial profile");
		expect(flags[0].points).toBeLessThan(0);
	});

	it("flags high tier with all 5 fields including long bio", () => {
		const profile: IdentifyProfile = {
			followers: 0,
			name: "Alice",
			company: "Acme Corp",
			location: "Berlin",
			blog: "https://example.com",
			bio: "I write software and love open source contributions.",
		};
		const flags = detectIdentityCompleteness(profile);
		expect(flags).toHaveLength(1);
		expect(flags[0].label).toBe("Complete profile");
		expect(flags[0].points).toBeLessThanOrEqual(-10);
	});
});

