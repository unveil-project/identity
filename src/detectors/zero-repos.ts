import { CONFIG } from "../config";
import { hasHomeOwner } from "../events";
import type { ActivityEvent, Flag } from "../types";

/**
 * No repositories of its own, and every event on someone else's repos.
 *
 * People who work for an organization often keep no public repos and do all
 * their work in the organization's repos. When most of the activity happens
 * under one owner, the account has a home there, so it is not flagged.
 */
export function detectZeroReposActivity(
	reposCount: number,
	externalEvents: ActivityEvent[],
	events: ActivityEvent[],
): Flag[] {
	const isAllExternal =
		reposCount === 0 && externalEvents.length === events.length;

	if (
		!isAllExternal ||
		events.length < CONFIG.ZERO_REPOS_MIN_EVENTS ||
		hasHomeOwner(externalEvents)
	) {
		return [];
	}

	return [
		{
			id: "zero-repos-external",
			points:
				CONFIG.POINTS_ZERO_REPOS_ACTIVE + CONFIG.POINTS_NO_PERSONAL_ACTIVITY,
			group: "external-focus",
			amplifiable: true,
			facts: {
				externalEvents: externalEvents.length,
				totalEvents: events.length,
			},
			events: externalEvents,
		},
	];
}
