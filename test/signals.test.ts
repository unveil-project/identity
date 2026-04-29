import { expect, describe, it, beforeEach, afterEach, vi } from "vitest";
import { identify } from "../src/identify";
import { getFixtures } from "./utils/get-fixtures";
import type { GitHubEvent } from "../src/types";

const date = new Date(2026, 2, 10, 12);

describe("Signals", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const fixtures = getFixtures();
  it.each(fixtures.map((_, index) => [index]))("analysis fixture %i", (index: number) => {
    const [fixture] = fixtures[index];
    vi.setSystemTime(date);

    const identity = identify({
      createdAt: fixture.user.created_at,
      reposCount: fixture.user.public_repos,
      accountName: fixture.user.login,
      events: fixture.events,
    });

    // Validate result structure
    expect(identity).toBeDefined();
    expect(identity.score).toBeGreaterThanOrEqual(0);
    expect(identity.score).toBeLessThanOrEqual(100);
    expect(["organic", "mixed", "automation"]).toContain(identity.classification);
    expect(Array.isArray(identity.flags)).toBe(true);
    expect(identity.profile).toBeDefined();
    expect(identity.profile.age).toBeGreaterThanOrEqual(0);
    expect(identity.profile.repos).toBeGreaterThanOrEqual(0);
    
    // Validate flag structure
    identity.flags.forEach((flag) => {
      expect(flag.label).toBeDefined();
      expect(flag.points).toBeGreaterThan(0);
      expect(flag.detail).toBeDefined();
    });
  });
});

describe("identify - Account Age Flags", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should flag recently created accounts (< 30 days old)", () => {
    const recentDate = new Date(2026, 2, 5); // 5 days old
    const result = identify({
      createdAt: recentDate.toISOString(),
      reposCount: 5,
      accountName: "newuser",
      events: [],
    });

    expect(result.flags).toContainEqual(
      expect.objectContaining({ label: "Recently created" })
    );
  });

  it("should flag young accounts (30-90 days old)", () => {
    const youngDate = new Date(2026, 0, 20); // ~50 days old
    const result = identify({
      createdAt: youngDate.toISOString(),
      reposCount: 5,
      accountName: "younguser",
      events: [],
    });

    expect(result.flags).toContainEqual(
      expect.objectContaining({ label: "Young account" })
    );
  });

  it("should not flag established accounts (> 90 days old)", () => {
    const establishedDate = new Date(2025, 11, 1); // > 100 days old
    const result = identify({
      createdAt: establishedDate.toISOString(),
      reposCount: 5,
      accountName: "olduser",
      events: [],
    });

    expect(
      result.flags.some((f) => f.label === "Recently created")
    ).toBe(false);
    expect(
      result.flags.some((f) => f.label === "Young account")
    ).toBe(false);
  });
});

describe("identify - Zero Repos & External Activity", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should flag accounts with no personal repos but external activity", () => {
    const events: GitHubEvent[] = [];
    // Need ZERO_REPOS_MIN_EVENTS (20) events for the flag to trigger
    for (let i = 0; i < 20; i++) {
      events.push({
        type: "PushEvent",
        created_at: new Date(2026, 2, 10, Math.floor(i / 4), 0, 0).toISOString(),
        repo: { name: `other-org/repo${i}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-12-01T00:00:00Z",
      reposCount: 0,
      accountName: "contributor",
      events,
    });

    expect(result.flags.some((f) =>
      f.label.includes("Only active on other people's repos")
    )).toBe(true);
  });
});

describe("identify - Fork Surge Detection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should flag multiple forks (5-7 in 24 hours)", () => {
    const events: GitHubEvent[] = [];
    for (let i = 0; i < 6; i++) {
      events.push({
        type: "ForkEvent",
        created_at: new Date(2026, 2, 10, i, 0, 0).toISOString(),
        repo: { name: `repo${i}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 10,
      accountName: "user",
      events,
    });

    expect(result.flags.some((f) => f.label === "Multiple forks")).toBe(true);
  });

  it("should flag many recent forks (8-19 in 24 hours)", () => {
    const events: GitHubEvent[] = [];
    for (let i = 0; i < 10; i++) {
      events.push({
        type: "ForkEvent",
        created_at: new Date(2026, 2, 10, i, 0, 0).toISOString(),
        repo: { name: `repo${i}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 10,
      accountName: "user",
      events,
    });

    expect(result.flags.some((f) => f.label === "Many recent forks")).toBe(true);
  });

  it("should not flag forks spread over more than 24 hours", () => {
    const events: GitHubEvent[] = [];
    for (let i = 0; i < 10; i++) {
      events.push({
        type: "ForkEvent",
        created_at: new Date(2026, 2, 10 + Math.floor(i / 3), i * 2, 0).toISOString(),
        repo: { name: `repo${i}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 10,
      accountName: "user",
      events,
    });

    expect(
      result.flags.some((f) =>
        f.label.includes("fork") || f.label.includes("Fork")
      )
    ).toBe(false);
  });
});

describe("identify - Repository Creation Patterns", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should flag frequent repository creation (8+ repos in 24 hours)", () => {
    const events: GitHubEvent[] = [];
    // Create 8 repo creation events - using UTC to avoid timezone issues
    for (let i = 0; i < 8; i++) {
      const date = new Date(Date.UTC(2026, 2, 10, i, 0, 0));
      events.push({
        type: "CreateEvent",
        created_at: date.toISOString(),
        repo: { name: `repo${i}` } as any,
        payload: { ref_type: "repository" },
      } as any);
    }
    // Add 2 more events to meet MIN_EVENTS_FOR_ANALYSIS (10)
    events.push({
      type: "PushEvent",
      created_at: new Date(Date.UTC(2026, 2, 10, 8, 0, 0)).toISOString(),
      repo: { name: "repo8" } as any,
    } as any);
    events.push({
      type: "PushEvent",
      created_at: new Date(Date.UTC(2026, 2, 10, 9, 0, 0)).toISOString(),
      repo: { name: "repo9" } as any,
    } as any);

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 100,
      accountName: "user",
      events,
    });

    expect(
      result.flags.some((f) =>
        f.label === "Frequent repository creation"
      )
    ).toBe(true);
  });

  it("should flag concentrated repository creation (16+ repos in 24 hours)", () => {
    const events: GitHubEvent[] = [];
    // Create 16 repo creation events - using UTC to avoid timezone issues
    for (let i = 0; i < 16; i++) {
      const date = new Date(Date.UTC(2026, 2, 10, Math.floor(i / 2), 0, 0));
      events.push({
        type: "CreateEvent",
        created_at: date.toISOString(),
        repo: { name: `repo${i}` } as any,
        payload: { ref_type: "repository" },
      } as any);
    }
    // Add 2 more events to meet MIN_EVENTS_FOR_ANALYSIS (10)
    events.push({
      type: "PushEvent",
      created_at: new Date(Date.UTC(2026, 2, 10, 8, 0, 0)).toISOString(),
      repo: { name: "extra1" } as any,
    } as any);
    events.push({
      type: "PushEvent",
      created_at: new Date(Date.UTC(2026, 2, 10, 9, 0, 0)).toISOString(),
      repo: { name: "extra2" } as any,
    } as any);

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 100,
      accountName: "user",
      events,
    });

    expect(
      result.flags.some((f) =>
        f.label === "Concentrated repository creation"
      )
    ).toBe(true);
  });

  it("should ignore CreateEvent that are branch creations, not repos", () => {
    const events: GitHubEvent[] = [];
    for (let i = 0; i < 5; i++) {
      const date = new Date(Date.UTC(2026, 2, 10, i, 0, 0));
      events.push({
        type: "CreateEvent",
        created_at: date.toISOString(),
        repo: { name: `repo${i}` } as any,
        payload: { ref_type: "branch" },
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 10,
      accountName: "user",
      events,
    });

    expect(
      result.flags.some((f) =>
        f.label.includes("Concentrated repository creation")
      )
    ).toBe(false);
  });
});

describe("identify - Activity Pattern Detection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should flag 24/7 activity pattern (< 3 hours sleep on single day)", () => {
    const events: GitHubEvent[] = [];
    // Simulate activity across 22 hours with only 1 hour gap
    for (let hour = 0; hour < 23; hour++) {
      if (hour !== 12) {
        // 1 hour gap
        events.push({
          type: "PushEvent",
          created_at: new Date(2026, 2, 10, hour, 0, 0).toISOString(),
          repo: { name: "repo" } as any,
        } as any);
        events.push({
          type: "PushEvent",
          created_at: new Date(2026, 2, 10, hour, 30, 0).toISOString(),
          repo: { name: "repo" } as any,
        } as any);
      }
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 5,
      accountName: "user",
      events,
    });

    expect(
      result.flags.some((f) => f.label === "24/7 activity pattern")
    ).toBe(true);
  });

  it("should not flag 24/7 pattern if activity is spread over multiple days", () => {
    const events: GitHubEvent[] = [];
    // Activity spread across multiple days, each day has normal sleep
    for (let day = 0; day < 5; day++) {
      for (let hour = 8; hour < 20; hour++) {
        events.push({
          type: "PushEvent",
          created_at: new Date(2026, 2, 10 + day, hour, 0, 0).toISOString(),
          repo: { name: "repo" } as any,
        } as any);
      }
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 5,
      accountName: "user",
      events,
    });

    expect(
      result.flags.some((f) => f.label === "24/7 activity pattern")
    ).toBe(false);
  });
});

describe("identify - Narrow Activity Focus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should flag narrow activity focus (few event types, no interactions)", () => {
    const events: GitHubEvent[] = [];
    for (let i = 0; i < 15; i++) {
      events.push({
        type: "PushEvent",
        created_at: new Date(2026, 2, 10, i, 0, 0).toISOString(),
        repo: { name: "repo" } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 5,
      accountName: "user",
      events,
    });

    // Pure push events with low diversity and no interaction
    expect(
      result.flags.some((f) => f.label === "Narrow activity focus")
    ).toBe(true);
  });

  it("should not flag narrow focus if there are human interactions", () => {
    const events: GitHubEvent[] = [];
    // Push events
    for (let i = 0; i < 12; i++) {
      events.push({
        type: "PushEvent",
        created_at: new Date(2026, 2, 10, i, 0, 0).toISOString(),
        repo: { name: "repo" } as any,
      } as any);
    }
    // Add interaction
    events.push({
      type: "IssueCommentEvent",
      created_at: new Date(2026, 2, 10, 13, 0, 0).toISOString(),
      repo: { name: "repo" } as any,
    } as any);

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 5,
      accountName: "user",
      events,
    });

    expect(
      result.flags.some((f) => f.label === "Narrow activity focus")
    ).toBe(false);
  });
});

describe("identify - Score Calculation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should calculate score as 100 minus sum of all flag points", () => {
    const events: GitHubEvent[] = [];
    // Create fork spike to add points
    for (let i = 0; i < 10; i++) {
      events.push({
        type: "ForkEvent",
        created_at: new Date(2026, 2, 10, i, 0, 0).toISOString(),
        repo: { name: `repo${i}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 10,
      accountName: "user",
      events,
    });

    // Should have some fork-related flags
    const totalPoints = result.flags.reduce((sum, flag) => sum + flag.points, 0);
    expect(result.score).toBe(100 - totalPoints);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it("should return score of 100 for account with no flags", () => {
    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 10,
      accountName: "established",
      events: [],
    });

    expect(result.score).toBe(100);
    expect(result.flags).toHaveLength(0);
  });

  it("should cap score at 0 minimum", () => {
    const events: GitHubEvent[] = [];
    // Create massive fork spike
    for (let i = 0; i < 50; i++) {
      events.push({
        type: "ForkEvent",
        created_at: new Date(2026, 2, 10, Math.floor(i / 2), i % 60, 0).toISOString(),
        repo: { name: `repo${i}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2026-03-08T00:00:00Z", // very new account
      reposCount: 0,
      accountName: "bot",
      events,
    });

    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});

describe("identify - Classification", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should classify as organic when score >= 70", () => {
    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 100,
      accountName: "established",
      events: [],
    });

    expect(result.classification).toBe("organic");
    expect(result.score).toBeGreaterThanOrEqual(70);
  });

  it("should classify as mixed when score is between 50-69", () => {
    const events: GitHubEvent[] = [];
    // Create moderate fork activity
    for (let i = 0; i < 6; i++) {
      events.push({
        type: "ForkEvent",
        created_at: new Date(2026, 2, 10, i, 0, 0).toISOString(),
        repo: { name: `repo${i}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2026-04-15T00:00:00Z", // 14 days old (new account penalty: 20 points)
      reposCount: 100,
      accountName: "user",
      events,
    });

    // Total penalty points: 26 (forks) + 20 (new account) = 46 → score = 100 - 46 = 54
    expect(result.classification).toBe("mixed");
    expect(result.score).toBeGreaterThanOrEqual(50);
    expect(result.score).toBeLessThan(70);
  });

  it("should classify as automation when score < 50", () => {
    const events: GitHubEvent[] = [];
    // Create multiple automation indicators
    for (let i = 0; i < 35; i++) {
      events.push({
        type: "ForkEvent",
        created_at: new Date(2026, 2, 10, Math.floor(i / 5), i * 2, 0).toISOString(),
        repo: { name: `repo${i}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2026-03-08T00:00:00Z", // 52 days old (young account penalty: 10 points)
      reposCount: 0,
      accountName: "bot",
      events,
    });

    // Total penalty points: 85 (forks) + 10 (young account) = 95 → score = 100 - 95 = 5
    expect(result.classification).toBe("automation");
    expect(result.score).toBeLessThan(50);
  });
});

describe("identify - Profile Information", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should include correct account age in profile", () => {
    const createdAt = "2025-12-01T00:00:00Z"; // ~100 days ago
    const result = identify({
      createdAt,
      reposCount: 5,
      accountName: "user",
      events: [],
    });

    expect(result.profile.age).toBeGreaterThanOrEqual(99);
    expect(result.profile.age).toBeLessThan(110);
  });

  it("should include repos count in profile", () => {
    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 42,
      accountName: "user",
      events: [],
    });

    expect(result.profile.repos).toBe(42);
  });
});
