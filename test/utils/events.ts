import type { GitHubEvent, IdentifyFlag, IdentifyUser } from "../../src/types";

/** Build a user, overriding only the fields a test cares about. */
export function user(overrides: Partial<IdentifyUser> = {}): IdentifyUser {
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
	} as unknown as GitHubEvent;
}

/** Build a minimal flag, for testing the scorer on its own. */
export function flag(
	group: IdentifyFlag["group"],
	points: number,
	label = `${group}-${points}`,
): IdentifyFlag {
	return { label, points, group, detail: "", data: [], events: [] };
}
