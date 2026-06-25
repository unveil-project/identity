import { CONFIG } from "../config";
import type { GitHubEvent, IdentifyFlag } from "../types";

export function detectZeroReposActivity(
	reposCount: number,
	foreignEvents: GitHubEvent[],
	events: GitHubEvent[],
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	const hasAllExternal =
		reposCount === 0 && foreignEvents.length === events.length;

	if (hasAllExternal && events.length >= CONFIG.ZERO_REPOS_MIN_EVENTS) {
		flags.push({
			label: "Only active on other people's repos",
			points:
				CONFIG.POINTS_ZERO_REPOS_ACTIVE + CONFIG.POINTS_NO_PERSONAL_ACTIVITY,
			detail: `No personal repos, all ${events.length} events are on repos they don't own`,
			data: [
				{ label: "Personal repos", value: 0 },
				{ label: "External events", value: foreignEvents.length },
				{ label: "Total events", value: events.length },
			],
			events: foreignEvents,
		});
	}

	return flags;
}
