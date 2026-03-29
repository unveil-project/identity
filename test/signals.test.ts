import { expect, describe, it, beforeEach, afterEach, vi } from "vitest";
import { identifyReplicant } from "../src/identify-replicant";
import { getFixtures } from "./utils/get-fixtures";

const date = new Date(2026, 2, 10, 12);

describe("Signals", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each(getFixtures())("analysis $1", (fixture) => {
    vi.setSystemTime(date);

    const identity = identifyReplicant({
      createdAt: fixture.user.created_at,
      reposCount: fixture.user.public_repos,
      accountName: fixture.user.login,
      events: fixture.events,
    });

    expect(identity).toMatchSnapshot();
  });
});
