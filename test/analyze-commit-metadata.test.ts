import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  hasAICommitMetadata,
  analyzeCommitMetadata,
} from "../src/modifiers/analyze-commit-metadata";
import { identify } from "../src/identify";
import type { GitHubCommit, GitHubEvent } from "../src/types";

const date = new Date(2026, 2, 10, 12);

describe("hasAICommitMetadata", () => {
  it.each<[string, string | undefined | null, boolean]>([
    ["empty undefined", undefined, false],
    ["empty null", null, false],
    ["empty string", "", false],
    ["plain message", "fix: typo in README", false],
    [
      "human co-author",
      "feat: x\n\nCo-authored-by: Alice <alice@example.com>",
      false,
    ],
    [
      "human named Cody",
      "fix\n\nCo-authored-by: Cody Smith <cody@example.com>",
      false,
    ],
    [
      "human named Claude",
      "fix\n\nCo-authored-by: Claude Lemieux <claude@example.com>",
      false,
    ],
    [
      "Claude trailer",
      "feat: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
      true,
    ],
    [
      "Claude trailer with model name",
      "fix\n\nCo-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>",
      true,
    ],
    [
      "Claude Code footer (emoji)",
      "chore\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)",
      true,
    ],
    [
      "Claude Code footer (plain)",
      "docs: update\n\nGenerated with Claude Code",
      true,
    ],
    [
      "Copilot github.com email",
      "feat: x\n\nCo-authored-by: GitHub Copilot <copilot@github.com>",
      true,
    ],
    [
      "Copilot users.noreply email",
      "feat: y\n\nCo-authored-by: Copilot <198982749+Copilot@users.noreply.github.com>",
      true,
    ],
    [
      "Cursor agent",
      "feat: z\n\nCo-authored-by: Cursor Agent <cursoragent@cursor.com>",
      true,
    ],
    [
      "Devin AI integration",
      "wip\n\nCo-authored-by: Devin AI <158243242+devin-ai-integration[bot]@users.noreply.github.com>",
      true,
    ],
    [
      "Codex via openai.com",
      "fix\n\nCo-authored-by: codex <codex@openai.com>",
      true,
    ],
    [
      "openai-codex name",
      "fix\n\nCo-authored-by: openai-codex <foo@bar>",
      true,
    ],
    [
      "Aider",
      "refactor\n\nCo-authored-by: aider (claude-3.5-sonnet)",
      true,
    ],
    [
      "OpenHands agent",
      "feat\n\nCo-authored-by: openhands <openhands-agent@example.com>",
      true,
    ],
    [
      "Sourcegraph Cody",
      "fix\n\nCo-authored-by: Cody <cody@sourcegraph.com>",
      true,
    ],
  ])("%s -> %s", (_label, message, expected) => {
    expect(hasAICommitMetadata(message)).toBe(expected);
  });
});

describe("analyzeCommitMetadata", () => {
  it("returns zeros for empty input", () => {
    expect(analyzeCommitMetadata([])).toEqual({
      totalCommits: 0,
      aiCommits: 0,
      ratio: 0,
    });
  });

  it("counts all commits when none are AI-attributed", () => {
    const commits: GitHubCommit[] = [
      { sha: "a", message: "fix: a" },
      { sha: "b", message: "fix: b" },
    ];
    const result = analyzeCommitMetadata(commits);
    expect(result.totalCommits).toBe(2);
    expect(result.aiCommits).toBe(0);
    expect(result.ratio).toBe(0);
  });

  it("reports ratio of AI-attributed commits", () => {
    const commits: GitHubCommit[] = [
      { sha: "a", message: "fix: a" },
      {
        sha: "b",
        message: "feat: b\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
      },
      {
        sha: "c",
        message:
          "feat: c\n\nCo-authored-by: GitHub Copilot <copilot@github.com>",
      },
    ];
    const result = analyzeCommitMetadata(commits);
    expect(result.totalCommits).toBe(3);
    expect(result.aiCommits).toBe(2);
    expect(result.ratio).toBeCloseTo(2 / 3, 5);
  });

  it("deduplicates commits by sha", () => {
    const commits: GitHubCommit[] = [
      {
        sha: "same",
        message: "feat\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
      },
      {
        sha: "same",
        message: "feat\n\nCo-Authored-By: Claude <noreply@anthropic.com>",
      },
    ];
    const result = analyzeCommitMetadata(commits);
    expect(result.totalCommits).toBe(1);
    expect(result.aiCommits).toBe(1);
  });
});

describe("identify - AI commit metadata flag", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function makeAICommits(count: number): GitHubCommit[] {
    return Array.from({ length: count }, (_, i) => ({
      sha: `ai-${i}`,
      message: `feat: change ${i}\n\nCo-Authored-By: Claude <noreply@anthropic.com>`,
    }));
  }

  function makeHumanCommits(count: number): GitHubCommit[] {
    return Array.from({ length: count }, (_, i) => ({
      sha: `h-${i}`,
      message: `fix: change ${i}`,
    }));
  }

  function runWithCommits(commits: GitHubCommit[], excludeRepos?: string[]) {
    return identify({
      createdAt: "2025-01-01T00:00:00Z",
      reposCount: 10,
      accountName: "user",
      events: [],
      commits,
      excludeRepos,
    });
  }

  // Builds 6 forks within 24h → triggers "Multiple forks" (26 points, amplifiable).
  function makeForkBurstEvents(): GitHubEvent[] {
    return Array.from({ length: 6 }, (_, i) => ({
      type: "ForkEvent",
      created_at: new Date(date.getTime() - i * 3600_000).toISOString(),
      repo: { name: `target/repo${i}` } as any,
    } as any));
  }

  it("pushes a 0-point visibility flag at >= 90% AI ratio", () => {
    const result = runWithCommits([
      ...makeAICommits(9),
      ...makeHumanCommits(1),
    ]);
    const flag = result.flags.find(
      (f) => f.label === "Predominantly AI-attributed commits",
    );
    expect(flag).toBeDefined();
    expect(flag?.points).toBe(0);
    expect(flag?.detail).toMatch(/9\/10 commits \(90%\)/);
  });

  it.each<[number, number]>([
    [7, 3], // 70% — below lowest (75%) tier
    [4, 6], // 40%
    [2, 8], // 20%
  ])("does not flag %i AI / %i human commits", (ai, human) => {
    const result = runWithCommits([
      ...makeAICommits(ai),
      ...makeHumanCommits(human),
    ]);
    expect(
      result.flags.some((f) => f.label.includes("AI-attributed commits")),
    ).toBe(false);
  });

  it("does not flag when below minimum commit count", () => {
    const result = runWithCommits(makeAICommits(3));
    expect(
      result.flags.some((f) => f.label.includes("AI-attributed commits")),
    ).toBe(false);
  });

  it.each<[number, number, number, number]>([
    // [aiCount, humanCount, expectedMultiplier, expectedAmplifiedPoints]
    [15, 5, 1.15, 30], // 75% tier → 26 * 1.15 = 29.9 → 30
    [17, 3, 1.3, 34], // 85% tier → 26 * 1.3 = 33.8 → 34
    [18, 2, 1.5, 39], // 90% tier → 26 * 1.5 = 39
  ])(
    "applies %s tier multiplier (%i AI / %i human) to amplifiable flags",
    (ai, human, multiplier, expected) => {
      const events = makeForkBurstEvents();
      const commits = [...makeAICommits(ai), ...makeHumanCommits(human)];

      const withCommits = identify({
        createdAt: "2025-01-01T00:00:00Z",
        reposCount: 10,
        accountName: "user",
        events,
        commits,
      });
      const withoutCommits = identify({
        createdAt: "2025-01-01T00:00:00Z",
        reposCount: 10,
        accountName: "user",
        events,
      });

      expect(withoutCommits.score).toBe(100 - 26); // 74
      expect(withCommits.score).toBe(100 - expected);

      const flag = withCommits.flags.find(
        (f) => f.label === "Predominantly AI-attributed commits",
      );
      expect(flag?.detail).toContain(`${multiplier}x multiplier applied to automation signals`);
    },
  );

  it("does NOT amplify non-spam flags (account age, diversity, etc.)", () => {
    const commits = [...makeAICommits(9), ...makeHumanCommits(1)];
    // 14-day-old account triggers "Recently created" (20 points) — not amplifiable.
    const withMultiplier = identify({
      createdAt: new Date(date.getTime() - 14 * 86400000).toISOString(),
      reposCount: 10,
      accountName: "user",
      events: [],
      commits,
    });
    const withoutMultiplier = identify({
      createdAt: new Date(date.getTime() - 14 * 86400000).toISOString(),
      reposCount: 10,
      accountName: "user",
      events: [],
    });
    // Both should be 80 — multiplier must not touch "Recently created".
    expect(withoutMultiplier.score).toBe(80);
    expect(withMultiplier.score).toBe(80);
  });

  it("still shows informational flag when no amplifiable signals exist", () => {
    const commits = [...makeAICommits(9), ...makeHumanCommits(1)];
    const result = runWithCommits(commits);
    expect(result.score).toBe(100);
    const flag = result.flags.find(
      (f) => f.label === "Predominantly AI-attributed commits",
    );
    expect(flag).toBeDefined();
    expect(flag?.detail).toContain("no automation signals to amplify");
  });

  it("respects excludeRepos for commits", () => {
    const commits: GitHubCommit[] = [
      ...Array.from({ length: 9 }, (_, i) => ({
        sha: `excluded-${i}`,
        message: `feat: x\n\nCo-Authored-By: Claude <noreply@anthropic.com>`,
        repo: "user/skipme",
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        sha: `h-${i}`,
        message: `fix: change ${i}`,
        repo: "user/keep",
      })),
    ];
    const result = runWithCommits(commits, ["user/skipme"]);
    expect(
      result.flags.some((f) => f.label.includes("AI-attributed commits")),
    ).toBe(false);
  });
});
