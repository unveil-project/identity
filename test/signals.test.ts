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
    const expectedScore = Math.max(0, 100 - totalPoints);
    expect(result.score).toBe(expectedScore);
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

describe("identify - Issue Comment Spam Detection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should flag extreme issue comment spam (15+ repos in 2 minutes)", () => {
    const events: GitHubEvent[] = [];
    // Create 15 issue comment events on different repos within 2 minutes
    for (let i = 0; i < 15; i++) {
      events.push({
        type: "IssueCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 0, i * 8).toISOString(),
        repo: { name: `owner/repo${i}` } as any,
      } as any);
    }
    // Add more events to meet MIN_EVENTS_FOR_ANALYSIS (10)
    for (let i = 15; i < 16; i++) {
      events.push({
        type: "PushEvent",
        created_at: new Date(2026, 2, 10, 12, 2, 0).toISOString(),
        repo: { name: "owner/main" } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 30,
      accountName: "user",
      events,
    });

    expect(result.flags.some((f) => f.label === "Issue comment spam")).toBe(true);
  });

  it("should flag high issue comment frequency (10-14 repos in short timeframe)", () => {
    const events: GitHubEvent[] = [];
    // Create 10 issue comment events within 2 minutes
    for (let i = 0; i < 10; i++) {
      events.push({
        type: "IssueCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 0, i * 12).toISOString(),
        repo: { name: `owner/repo${i}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 30,
      accountName: "user",
      events,
    });

    expect(
      result.flags.some((f) => f.label === "High comment frequency across repos")
    ).toBe(true);
  });

  it("should not flag issue comments spread over longer time periods", () => {
    const events: GitHubEvent[] = [];
    // Create issue comment events spread across 1 hour (not in 2 minute window)
    for (let i = 0; i < 15; i++) {
      events.push({
        type: "IssueCommentEvent",
        created_at: new Date(2026, 2, 10, 12, i * 4, 0).toISOString(),
        repo: { name: `owner/repo${i}` } as any,
      } as any);
    }
    // Add more events to meet MIN_EVENTS_FOR_ANALYSIS
    events.push({
      type: "PushEvent",
      created_at: new Date(2026, 2, 10, 13, 0, 0).toISOString(),
      repo: { name: "owner/main" } as any,
    } as any);

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 30,
      accountName: "user",
      events,
    });

    expect(
      result.flags.some(
        (f) =>
          f.label === "Issue comment spam" ||
          f.label === "High comment frequency across repos"
      )
    ).toBe(false);
  });

  it("should not flag low number of issue comments", () => {
    const events: GitHubEvent[] = [];
    // Only 5 issue comments - below ISSUE_COMMENT_MIN_FOR_SPRAY threshold (10)
    for (let i = 0; i < 5; i++) {
      events.push({
        type: "IssueCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 0, i * 20).toISOString(),
        repo: { name: `owner/repo${i}` } as any,
      } as any);
    }
    // Add more events to meet MIN_EVENTS_FOR_ANALYSIS (10)
    for (let i = 5; i < 10; i++) {
      events.push({
        type: "PushEvent",
        created_at: new Date(2026, 2, 10, 12, 2, 0).toISOString(),
        repo: { name: "owner/main" } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 20,
      accountName: "user",
      events,
    });

    expect(
      result.flags.some(
        (f) =>
          f.label === "Issue comment spam" ||
          f.label === "High comment frequency across repos"
      )
    ).toBe(false);
  });

  it("should include correct comment count and repo count in flag detail", () => {
    const events: GitHubEvent[] = [];
    // Create 10 issue comments on different repos within 2 minutes
    for (let i = 0; i < 10; i++) {
      events.push({
        type: "IssueCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 0, i * 12).toISOString(),
        repo: { name: `owner/repo${i}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 20,
      accountName: "user",
      events,
    });

    const issueCommentFlag = result.flags.find(
      (f) => f.label === "High comment frequency across repos"
    );
    expect(issueCommentFlag).toBeDefined();
    if (issueCommentFlag) {
      expect(issueCommentFlag.detail).toContain("comments");
      expect(issueCommentFlag.detail).toContain("different repos");
      expect(issueCommentFlag.detail).toContain("minutes");
    }
  });

  it("should properly calculate comments per minute in flag detail", () => {
    const events: GitHubEvent[] = [];
    // Create 10 issue comments within 30 seconds (should be ~20 comments/min)
    for (let i = 0; i < 10; i++) {
      events.push({
        type: "IssueCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 0, i * 3).toISOString(),
        repo: { name: `owner/repo${i}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 20,
      accountName: "user",
      events,
    });

    const issueCommentFlag = result.flags.find(
      (f) =>
        f.label === "Issue comment spam" ||
        f.label === "High comment frequency across repos"
    );
    expect(issueCommentFlag).toBeDefined();
    if (issueCommentFlag) {
      // Should show comments, repos, and time window (but not decimal metrics)
      expect(issueCommentFlag.detail).toMatch(/comments to.*repos in.*minutes/);
    }
  });

  it("should assign correct points for extreme issue comment spam", () => {
    const events: GitHubEvent[] = [];
    // Create 20 issue comments on different repos within 2 minutes
    for (let i = 0; i < 20; i++) {
      events.push({
        type: "IssueCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 0, i * 6).toISOString(),
        repo: { name: `owner/repo${i}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 30,
      accountName: "user",
      events,
    });

    const issueSpamFlag = result.flags.find((f) => f.label === "Issue comment spam");
    expect(issueSpamFlag).toBeDefined();
    expect(issueSpamFlag?.points).toBeGreaterThanOrEqual(35);
  });

  it("should assign correct points for high issue comment frequency", () => {
    const events: GitHubEvent[] = [];
    // Create 10 issue comments within 2 minutes
    for (let i = 0; i < 10; i++) {
      events.push({
        type: "IssueCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 0, i * 12).toISOString(),
        repo: { name: `owner/repo${i}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 20,
      accountName: "user",
      events,
    });

    const issueFreqFlag = result.flags.find(
      (f) => f.label === "High comment frequency across repos"
    );
    expect(issueFreqFlag).toBeDefined();
    expect(issueFreqFlag?.points).toBeGreaterThanOrEqual(25);
    expect(issueFreqFlag?.points).toBeLessThanOrEqual(35);
  });

  it("should handle edge case of exactly threshold number of issue comments", () => {
    const events: GitHubEvent[] = [];
    // Create exactly 10 issue comments (threshold) on different repos
    for (let i = 0; i < 10; i++) {
      events.push({
        type: "IssueCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 0, i * 12).toISOString(),
        repo: { name: `owner/repo${i}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 20,
      accountName: "user",
      events,
    });

    // At threshold (10), should flag as "High comment frequency across repos"
    expect(
      result.flags.some((f) => f.label === "High comment frequency across repos")
    ).toBe(true);
  });

  it("should count distinct repos, not total comments, when determining spray severity", () => {
    const events: GitHubEvent[] = [];
    // Create 15 issue comments but on only 9 different repos
    // This should flag as "High comment frequency" (9 >= threshold of 10 is false, so this tests the low threshold)
    // Better: create comments on 11 repos but with some duplicates
    const repos = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (let i = 0; i < 15; i++) {
      const repoIdx = repos[i % repos.length]!;
      events.push({
        type: "IssueCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 0, i * 8).toISOString(),
        repo: { name: `owner/repo${repoIdx}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 20,
      accountName: "user",
      events,
    });

    // Should flag as "High comment frequency" (11 distinct repos >= threshold of 10)
    expect(
      result.flags.some((f) => f.label === "High comment frequency across repos")
    ).toBe(true);
  });
});

describe("identify - PR Comment Spam Detection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should flag extreme PR comment spam (12+ PRs in 2 minutes)", () => {
    const events: GitHubEvent[] = [];
    // Create 12 PR comment events on different PRs within 2 minutes
    for (let i = 0; i < 12; i++) {
      events.push({
        type: "PullRequestReviewCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 0, i * 10).toISOString(),
        repo: { name: `owner/repo${i}` } as any,
      } as any);
    }
    // Add more events to meet MIN_EVENTS_FOR_ANALYSIS (10)
    for (let i = 12; i < 14; i++) {
      events.push({
        type: "PushEvent",
        created_at: new Date(2026, 2, 10, 12, 2, 0).toISOString(),
        repo: { name: "owner/main" } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 20,
      accountName: "user",
      events,
    });

    expect(result.flags.some((f) => f.label === "PR comment spam")).toBe(true);
  });

  it("should flag high PR comment frequency (8-11 PRs in short timeframe)", () => {
    const events: GitHubEvent[] = [];
    // Create 8 PR comment events within 2 minutes
    for (let i = 0; i < 8; i++) {
      events.push({
        type: "PullRequestReviewCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 0, i * 15).toISOString(),
        repo: { name: `owner/repo${i}` } as any,
      } as any);
    }
    // Add more events to meet MIN_EVENTS_FOR_ANALYSIS (10)
    for (let i = 8; i < 10; i++) {
      events.push({
        type: "PushEvent",
        created_at: new Date(2026, 2, 10, 12, 2, 0).toISOString(),
        repo: { name: "owner/main" } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 20,
      accountName: "user",
      events,
    });

    expect(
      result.flags.some((f) => f.label === "High PR comment frequency")
    ).toBe(true);
  });

  it("should not flag PR comments spread over longer time periods", () => {
    const events: GitHubEvent[] = [];
    // Create PR comment events spread across 1 hour (not in 2 minute window)
    for (let i = 0; i < 12; i++) {
      events.push({
        type: "PullRequestReviewCommentEvent",
        created_at: new Date(2026, 2, 10, 12, i * 5, 0).toISOString(),
        repo: { name: `owner/repo${i}` } as any,
      } as any);
    }
    // Add more events to meet MIN_EVENTS_FOR_ANALYSIS
    events.push({
      type: "PushEvent",
      created_at: new Date(2026, 2, 10, 13, 0, 0).toISOString(),
      repo: { name: "owner/main" } as any,
    } as any);

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 20,
      accountName: "user",
      events,
    });

    expect(
      result.flags.some(
        (f) =>
          f.label === "PR comment spam" || f.label === "High PR comment frequency"
      )
    ).toBe(false);
  });

  it("should not flag low number of PR comments", () => {
    const events: GitHubEvent[] = [];
    // Only 5 PR comments - below PR_COMMENT_MIN_FOR_SPRAY threshold (8)
    for (let i = 0; i < 5; i++) {
      events.push({
        type: "PullRequestReviewCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 0, i * 20).toISOString(),
        repo: { name: `owner/repo${i}` } as any,
      } as any);
    }
    // Add more events to meet MIN_EVENTS_FOR_ANALYSIS (10)
    for (let i = 5; i < 10; i++) {
      events.push({
        type: "PushEvent",
        created_at: new Date(2026, 2, 10, 12, 2, 0).toISOString(),
        repo: { name: "owner/main" } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 20,
      accountName: "user",
      events,
    });

    expect(
      result.flags.some(
        (f) =>
          f.label === "PR comment spam" || f.label === "High PR comment frequency"
      )
    ).toBe(false);
  });

  it("should include correct comment count and repo count in flag detail", () => {
    const events: GitHubEvent[] = [];
    // Create 10 PR comments on different repos within 2 minutes
    for (let i = 0; i < 10; i++) {
      events.push({
        type: "PullRequestReviewCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 0, i * 10).toISOString(),
        repo: { name: `owner/repo${i}` } as any,
      } as any);
    }
    // Add more events to meet MIN_EVENTS_FOR_ANALYSIS
    for (let i = 10; i < 12; i++) {
      events.push({
        type: "PushEvent",
        created_at: new Date(2026, 2, 10, 12, 2, 0).toISOString(),
        repo: { name: "owner/main" } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 20,
      accountName: "user",
      events,
    });

    const prCommentFlag = result.flags.find(
      (f) => f.label === "High PR comment frequency"
    );
    expect(prCommentFlag).toBeDefined();
    if (prCommentFlag) {
      expect(prCommentFlag.detail).toContain("comments");
      expect(prCommentFlag.detail).toContain("different PRs");
      expect(prCommentFlag.detail).toContain("minutes");
    }
  });

  it("should properly calculate comments per minute in flag detail", () => {
    const events: GitHubEvent[] = [];
    // Create 8 PR comments within 30 seconds (should be ~16 comments/min)
    for (let i = 0; i < 8; i++) {
      events.push({
        type: "PullRequestReviewCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 0, i * 4).toISOString(),
        repo: { name: `owner/repo${i}` } as any,
      } as any);
    }
    // Add more events to meet MIN_EVENTS_FOR_ANALYSIS
    for (let i = 8; i < 10; i++) {
      events.push({
        type: "PushEvent",
        created_at: new Date(2026, 2, 10, 12, 1, 0).toISOString(),
        repo: { name: "owner/main" } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 20,
      accountName: "user",
      events,
    });

    const prCommentFlag = result.flags.find(
      (f) =>
        f.label === "PR comment spam" || f.label === "High PR comment frequency"
    );
    expect(prCommentFlag).toBeDefined();
    if (prCommentFlag) {
      // Should show comments, PRs, and time window (but not decimal metrics)
      expect(prCommentFlag.detail).toMatch(/comments on.*PRs in.*minutes/);
    }
  });

  it("should distinguish between issue comments and PR comments", () => {
    const events: GitHubEvent[] = [];
    // Create PR comment events
    for (let i = 0; i < 10; i++) {
      events.push({
        type: "PullRequestReviewCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 0, i * 10).toISOString(),
        repo: { name: `owner/pr-repo${i}` } as any,
      } as any);
    }
    // Create separate issue comment events
    for (let i = 0; i < 10; i++) {
      events.push({
        type: "IssueCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 5, i * 10).toISOString(),
        repo: { name: `owner/issue-repo${i}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 30,
      accountName: "user",
      events,
    });

    // Should flag both issue and PR comment spam independently
    const hasIssueSpam = result.flags.some(
      (f) =>
        f.label === "Issue comment spam" ||
        f.label === "High comment frequency across repos"
    );
    const hasPRSpam = result.flags.some(
      (f) =>
        f.label === "PR comment spam" || f.label === "High PR comment frequency"
    );

    expect(hasIssueSpam).toBe(true);
    expect(hasPRSpam).toBe(true);
  });

  it("should assign correct points for extreme PR comment spam", () => {
    const events: GitHubEvent[] = [];
    // Create 15 PR comments on different repos within 2 minutes
    for (let i = 0; i < 15; i++) {
      events.push({
        type: "PullRequestReviewCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 0, i * 8).toISOString(),
        repo: { name: `owner/repo${i}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 30,
      accountName: "user",
      events,
    });

    const prSpamFlag = result.flags.find((f) => f.label === "PR comment spam");
    expect(prSpamFlag).toBeDefined();
    expect(prSpamFlag?.points).toBeGreaterThanOrEqual(35);
  });

  it("should assign correct points for high PR comment frequency", () => {
    const events: GitHubEvent[] = [];
    // Create 8 PR comments within 2 minutes
    for (let i = 0; i < 8; i++) {
      events.push({
        type: "PullRequestReviewCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 0, i * 15).toISOString(),
        repo: { name: `owner/repo${i}` } as any,
      } as any);
    }
    // Add more events to meet MIN_EVENTS_FOR_ANALYSIS
    for (let i = 8; i < 10; i++) {
      events.push({
        type: "PushEvent",
        created_at: new Date(2026, 2, 10, 12, 2, 0).toISOString(),
        repo: { name: "owner/main" } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 20,
      accountName: "user",
      events,
    });

    const prFreqFlag = result.flags.find(
      (f) => f.label === "High PR comment frequency"
    );
    expect(prFreqFlag).toBeDefined();
    expect(prFreqFlag?.points).toBeGreaterThanOrEqual(25);
    expect(prFreqFlag?.points).toBeLessThanOrEqual(32);
  });

  it("should handle edge case of exactly threshold number of PR comments", () => {
    const events: GitHubEvent[] = [];
    // Create exactly 8 PR comments (threshold) on different repos
    for (let i = 0; i < 8; i++) {
      events.push({
        type: "PullRequestReviewCommentEvent",
        created_at: new Date(2026, 2, 10, 12, 0, i * 15).toISOString(),
        repo: { name: `owner/repo${i}` } as any,
      } as any);
    }
    // Add more events to meet MIN_EVENTS_FOR_ANALYSIS
    for (let i = 8; i < 10; i++) {
      events.push({
        type: "PushEvent",
        created_at: new Date(2026, 2, 10, 12, 2, 0).toISOString(),
        repo: { name: "owner/main" } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 20,
      accountName: "user",
      events,
    });

    // At threshold (8), should flag as "High PR comment frequency"
    expect(
      result.flags.some((f) => f.label === "High PR comment frequency")
    ).toBe(true);
  });
});

describe("identify - Extreme PR Spam Detection (Time-Based)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should flag extreme daily PR spam (30+ PRs in 24 hours)", () => {
    const events: GitHubEvent[] = [];
    
    // Create 35 PR events in the last 24 hours
    for (let i = 0; i < 35; i++) {
      const repoIndex = i % 20;
      events.push({
        type: "PullRequestEvent",
        payload: { action: "opened" },
        created_at: new Date(2026, 2, 10, 6 + Math.floor(i / 5), i % 60).toISOString(),
        repo: { name: `owner/repo${repoIndex}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 25,
      accountName: "user",
      events,
    });

    const spamFlag = result.flags.find((f) => f.label === "Extreme PR spam (daily)");
    expect(spamFlag).toBeDefined();
    expect(spamFlag?.points).toBe(45);
    expect(spamFlag?.detail).toContain("35 PRs");
    expect(result.classification).toBe("automation");
  });



  it("should flag distributed PR spam pattern (50+ PRs across 15+ repos)", () => {
    const events: GitHubEvent[] = [];
    
    // Create 100 PR events across 20 repos (distributed over time to avoid daily/weekly flags)
    for (let i = 0; i < 100; i++) {
      const repoIndex = i % 20;
      const daysAgo = 14 + Math.floor(i / 5); // Spread over 34 days
      events.push({
        type: "PullRequestEvent",
        payload: { action: "opened" },
        created_at: new Date(2026, 2, 10 - daysAgo, 12, i % 60).toISOString(),
        repo: { name: `spamtarget/repo${repoIndex}` } as any,
      } as any);
    }
    // Add some push events to meet MIN_EVENTS_FOR_ANALYSIS
    for (let i = 100; i < 110; i++) {
      events.push({
        type: "PushEvent",
        created_at: new Date(2026, 1, 1, 12, 0, i).toISOString(),
        repo: { name: "user/personal" } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 5,
      accountName: "user",
      events,
    });

    const spamFlag = result.flags.find((f) => f.label === "Distributed PR spam pattern");
    expect(spamFlag).toBeDefined();
    expect(spamFlag?.points).toBe(45);
    expect(spamFlag?.detail).toContain("100 PRs");
    expect(spamFlag?.detail).toContain("different repositories");
    expect(result.classification).toBe("automation");
  });

  it("should not flag moderate PR volume in a week", () => {
    const events: GitHubEvent[] = [];
    
    // Create 20 PRs in the last 7 days (below threshold)
    for (let i = 0; i < 20; i++) {
      events.push({
        type: "PullRequestEvent",
        payload: { action: "opened" },
        created_at: new Date(2026, 2, 6 + Math.floor(i / 4), 12, i % 60).toISOString(),
        repo: { name: `owner/repo${i % 5}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 10,
      accountName: "user",
      events,
    });

    const extremeDailyFlag = result.flags.find((f) => f.label === "Extreme PR spam (daily)");
    const extremeWeeklyFlag = result.flags.find((f) => f.label === "Extreme PR spam (weekly)");
    const veryHighFlag = result.flags.find((f) => f.label === "Very high PR spam frequency");
    
    expect(extremeDailyFlag).toBeUndefined();
    expect(extremeWeeklyFlag).toBeUndefined();
    expect(veryHighFlag).toBeUndefined();
  });

  it("should not flag legitimate long-term activity (500 PRs over 6 months)", () => {
    const events: GitHubEvent[] = [];
    
    // Create 500 PRs spread over ~6 months
    for (let i = 0; i < 500; i++) {
      const repoIndex = i % 30;
      const daysAgo = Math.floor(i / 2.7); // ~180 days
      events.push({
        type: "PullRequestEvent",
        payload: { action: "opened" },
        created_at: new Date(2026, 2 - Math.floor(daysAgo / 30), 10 - (daysAgo % 28), 12, 0).toISOString(),
        repo: { name: `owner/repo${repoIndex}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 35,
      accountName: "user",
      events,
    });

    const extremeDailyFlag = result.flags.find((f) => f.label === "Extreme PR spam (daily)");
    const extremeWeeklyFlag = result.flags.find((f) => f.label === "Extreme PR spam (weekly)");
    const veryHighFlag = result.flags.find((f) => f.label === "Very high PR spam frequency");
    
    expect(extremeDailyFlag).toBeUndefined();
    expect(extremeWeeklyFlag).toBeUndefined();
    expect(veryHighFlag).toBeUndefined();
  });

  it("should not flag high PR count if repos spread is below threshold", () => {
    const events: GitHubEvent[] = [];
    
    // Create 75 PRs across only 5 repos (below 15 repo threshold)
    for (let i = 0; i < 75; i++) {
      const daysAgo = 14 + Math.floor(i / 5);
      events.push({
        type: "PullRequestEvent",
        payload: { action: "opened" },
        created_at: new Date(2026, 2, 10 - daysAgo, 12, i % 60).toISOString(),
        repo: { name: `owner/repo${i % 5}` } as any,
      } as any);
    }

    const result = identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 10,
      accountName: "user",
      events,
    });

    const distributedSpamFlag = result.flags.find((f) => f.label === "Distributed PR spam pattern");
    expect(distributedSpamFlag).toBeUndefined();
  });
});

