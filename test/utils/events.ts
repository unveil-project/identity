import {
	fromGitHub,
	fromGitHubEvent,
	type GitHubEvent,
	type GitHubInput,
	type GitHubUser,
} from "../../src/providers/github";
import { report } from "../../src/report";
import type { IdentifyEvent, IdentifyFlag } from "../../src/types";

/** Build a user, overriding only the fields a test cares about. */
export function user(overrides: Partial<GitHubUser> = {}): GitHubUser {
	return {
		login: "user",
		created_at: "2025-01-01T00:00:00Z",
		public_repos: 10,
		...overrides,
	};
}

/** Build a minimal GitHub event. */
export function event(
	type: string,
	iso: string,
	repo: string,
	payload?: Record<string, unknown>,
): GitHubEvent {
	return {
		type,
		created_at: iso,
		repo: { name: repo },
		payload,
	} as GitHubEvent;
}

/** Turn GitHub test events into the shape `identify` reads. */
export function toEvents(
	events: GitHubEvent[],
	login = "user",
): IdentifyEvent<GitHubEvent>[] {
	return events.map((e) => fromGitHubEvent(e, login));
}

/**
 * Run `report` on GitHub test data, the way a GitHub caller would, so tests
 * can read the flags with their labels and details.
 */
export function identifyGitHub(input: GitHubInput) {
	return report(fromGitHub(input));
}

/** Build a minimal flag, for testing the scorer on its own. */
export function flag(group: IdentifyFlag["group"], points: number): IdentifyFlag {
	return { id: "new-account", points, group, facts: { ageDays: 0 }, events: [] };
}
