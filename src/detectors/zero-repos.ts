import { CONFIG } from "../config";
import type { IdentifyEvent, IdentifyFlag } from "../types";

export function detectZeroReposActivity(
	reposCount: number,
	foreignEvents: IdentifyEvent[],
	events: IdentifyEvent[],
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	const hasAllExternal =
		reposCount === 0 && foreignEvents.length === events.length;

	if (hasAllExternal && events.length >= CONFIG.ZERO_REPOS_MIN_EVENTS) {
		flags.push({
			id: "zero-repos-external",
			points:
				CONFIG.POINTS_ZERO_REPOS_ACTIVE + CONFIG.POINTS_NO_PERSONAL_ACTIVITY,
			group: "external-focus",
			amplifiable: true,
			facts: {
				externalEvents: foreignEvents.length,
				totalEvents: events.length,
			},
			events: foreignEvents,
		});
	}

	return flags;
}
