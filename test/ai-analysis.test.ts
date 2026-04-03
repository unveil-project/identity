import { expect, describe, it, vi, beforeEach, afterEach } from "vitest";
import { buildUserPrompt, SYSTEM_PROMPT } from "../src/ai/prompt";
import { getAIAnalysis } from "../src/ai/analysis";
import type { AIAnalysisInput } from "../src/ai/types";
import type { GitHubEvent, IdentifyResult } from "../src/types";

const date = new Date(2026, 2, 10, 12);

function makeEvent(overrides: Partial<GitHubEvent> = {}): GitHubEvent {
  return {
    id: "1",
    type: "PushEvent",
    actor: { id: 1, login: "testuser", display_login: "testuser", gravatar_id: "", url: "", avatar_url: "" },
    repo: { id: 1, name: "testuser/repo-1", url: "" },
    payload: { size: 1, commits: [{ message: "fix stuff" }] },
    public: true,
    created_at: "2026-03-09T10:00:00Z",
    ...overrides,
  } as GitHubEvent;
}

function makeInput(overrides: Partial<AIAnalysisInput> = {}): AIAnalysisInput {
  return {
    token: "ghp_test_token",
    username: "testuser",
    accountCreatedAt: "2025-01-01T00:00:00Z",
    publicRepos: 5,
    events: [
      makeEvent(),
      makeEvent({ type: "CreateEvent", created_at: "2026-03-09T09:00:00Z", payload: { ref_type: "branch", ref: "feat/test" } }),
    ],
    ...overrides,
  };
}

describe("buildUserPrompt", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("includes account metadata", () => {
    const prompt = buildUserPrompt(makeInput());
    expect(prompt).toContain("Username: testuser");
    expect(prompt).toContain("Account Created At: 2025-01-01T00:00:00Z");
    expect(prompt).toContain("Public Repos: 5");
  });

  it("includes event summary stats", () => {
    const prompt = buildUserPrompt(makeInput());
    expect(prompt).toContain("Sampled events: 2");
    expect(prompt).toContain("Unique repos: 1");
    expect(prompt).toContain("PushEvent(1)");
    expect(prompt).toContain("CreateEvent(1)");
  });

  it("shows orgs when provided", () => {
    const prompt = buildUserPrompt(makeInput({ orgs: ["acme-corp", "open-source-org"] }));
    expect(prompt).toContain("acme-corp, open-source-org");
  });

  it("shows fallback when no orgs", () => {
    const prompt = buildUserPrompt(makeInput({ orgs: [] }));
    expect(prompt).toContain("None / not provided");

    const prompt2 = buildUserPrompt(makeInput());
    expect(prompt2).toContain("None / not provided");
  });

  it("includes heuristic analysis when provided", () => {
    const analysis: IdentifyResult = {
      score: 35,
      classification: "automation",
      flags: [
        { label: "Fork surge", points: 51, detail: "8 forks in 24h" },
        { label: "Young account", points: 10, detail: "Account is 60 days old" },
      ],
      profile: { age: 60, repos: 2 },
    };
    const prompt = buildUserPrompt(makeInput({ analysis }));
    expect(prompt).toContain("Score: 35, Classification: automation");
    expect(prompt).toContain("Fork surge (51 pts): 8 forks in 24h");
    expect(prompt).toContain("Young account (10 pts)");
  });

  it("omits heuristic section when no analysis provided", () => {
    const prompt = buildUserPrompt(makeInput());
    expect(prompt).not.toContain("Heuristic analysis");
  });

  it("includes compressed event data", () => {
    const prompt = buildUserPrompt(makeInput());
    expect(prompt).toContain("Events:");
  });

  it("computes date range from events", () => {
    const events = [
      makeEvent({ created_at: "2026-03-01T00:00:00Z" }),
      makeEvent({ created_at: "2026-03-05T12:00:00Z" }),
      makeEvent({ created_at: "2026-03-09T23:59:00Z" }),
    ];
    const prompt = buildUserPrompt(makeInput({ events }));
    expect(prompt).toContain("Date range: 2026-03-01T00:00:00Z to 2026-03-09T23:59:00Z");
  });
});

describe("getAIAnalysis", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("throws when no token is provided", async () => {
    vi.stubEnv("GITHUB_TOKEN", "");

    await expect(getAIAnalysis(makeInput({ token: undefined }))).rejects.toThrow(
      "GitHub token is required",
    );
  });

  it("calls the GitHub Models API with correct parameters", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ classification: "organic", confidence: 85, reasoning: "Normal activity." }) } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await getAIAnalysis(makeInput({ model: "openai/gpt-4o" }));

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://models.github.ai/inference/chat/completions");
    expect(options.method).toBe("POST");
    expect(options.headers.Authorization).toBe("Bearer ghp_test_token");

    const body = JSON.parse(options.body);
    expect(body.model).toBe("openai/gpt-4o");
    expect(body.temperature).toBe(0.3);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("system");
    expect(body.messages[0].content).toBe(SYSTEM_PROMPT);
    expect(body.messages[1].role).toBe("user");
  });

  it("parses a valid API response", async () => {
    const expected = { classification: "automation" as const, confidence: 92, reasoning: "Fork surge detected." };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify(expected) } }] }),
    } as Response);

    const result = await getAIAnalysis(makeInput());
    expect(result).toEqual(expected);
  });

  it("returns null when API returns empty content", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: "" } }] }),
    } as Response);

    expect(await getAIAnalysis(makeInput())).toBeNull();
  });

  it("returns null when choices are missing", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [] }),
    } as Response);

    expect(await getAIAnalysis(makeInput())).toBeNull();
  });

  it("strips DeepSeek thinking tags", async () => {
    const payload = { classification: "organic", confidence: 80, reasoning: "Looks human." };
    const content = `<think>Let me analyze this step by step...\nMultiple lines of thinking.</think>${JSON.stringify(payload)}`;
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content } }] }),
    } as Response);

    const result = await getAIAnalysis(makeInput({ model: "deepseek/DeepSeek-R1" }));
    expect(result).toEqual(payload);
  });

  it("throws on non-ok response", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: () => Promise.resolve("Bad credentials"),
    } as unknown as Response);

    await expect(getAIAnalysis(makeInput())).rejects.toThrow("401 Unauthorized: Bad credentials");
  });

  it("rejects invalid classification values via Zod", async () => {
    const invalid = { classification: "maybe", confidence: 50, reasoning: "unsure" };
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: JSON.stringify(invalid) } }] }),
    } as Response);

    await expect(getAIAnalysis(makeInput())).rejects.toThrow();
  });

  it("uses GITHUB_TOKEN from env when no token in input", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_env_token");

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ classification: "organic", confidence: 70, reasoning: "ok" }) } }],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    await getAIAnalysis(makeInput({ token: undefined }));

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers.Authorization).toBe("Bearer ghp_env_token");
  });
});
