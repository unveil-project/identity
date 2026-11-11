import { CONFIG } from "../config";
import type { ActivityEvent, ActivityEventType, Flag } from "../types";
import { calculateNormalizedShannonsEntropy, countBy } from "../utils";

/** Event types where the account talks to other people. */
const INTERACTION_TYPES: readonly ActivityEventType[] = [
	"issue-comment",
	"review",
	"review-comment",
];

/**
 * Bots tend to repeat one or two kinds of action. People mix many kinds and
 * talk to others along the way.
 */
export function detectNarrowActivityFocus(events: ActivityEvent[]): Flag[] {
	if (events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return [];
	}

	const countsByType = countBy(events, (event) => event.type);
	const entropy = calculateNormalizedShannonsEntropy([
		...countsByType.values(),
	]);

	const isNarrow =
		countsByType.size <= CONFIG.DIVERSITY_MAX_EVENT_TYPES &&
		entropy < CONFIG.DIVERSITY_MAX_ENTROPY;
	const hasInteraction = INTERACTION_TYPES.some((type) =>
		countsByType.has(type),
	);
	const hasStars = countsByType.has("star");

	if (!isNarrow || hasInteraction || hasStars) {
		return [];
	}

	return [
		{
			id: "narrow-activity",
			points: CONFIG.POINTS_LOW_DIVERSITY,
			group: "diversity",
			amplifiable: true,
			facts: { eventTypes: countsByType.size, entropy },
			events,
		},
	];
}
