import { CONFIG } from "../config";
import { densestEventWindow, isRepoCreation } from "../events";
import type { ActivityEvent, Flag } from "../types";
import { levelFor, type RampAnchor, rampPoints } from "../utils";

const CREATE_BURST_LEVELS = [
	{ min: CONFIG.CREATE_BURST_HIGH, id: "repo-creation-high" },
	{ min: CONFIG.CREATE_BURST_EXTREME, id: "repo-creation-extreme" },
] as const;

const CREATE_BURST_RAMP: readonly RampAnchor[] = [
	[CONFIG.CREATE_BURST_HIGH, CONFIG.POINTS_CREATE_BURST_HIGH],
	[CONFIG.CREATE_BURST_EXTREME, CONFIG.POINTS_CREATE_BURST_EXTREME],
];

/** Many new repositories within one day. Branches and tags do not count. */
export function detectRepositoryCreationBurst(events: ActivityEvent[]): Flag[] {
	if (events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return [];
	}

	const created = events.filter(isRepoCreation);
	if (created.length < CONFIG.CREATE_EVENTS_MIN) {
		return [];
	}

	const burst = densestEventWindow(created, 24);
	const level = levelFor(burst.count, CREATE_BURST_LEVELS);
	if (!level) {
		return [];
	}

	return [
		{
			id: level.id,
			points: rampPoints(burst.count, CREATE_BURST_RAMP),
			group: "repo-creation",
			amplifiable: true,
			facts: { created: burst.count, totalCreated: created.length },
			events: burst.items,
		},
	];
}
