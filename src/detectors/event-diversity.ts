import { CONFIG } from "../config";
import type { IdentifyEvent, IdentifyFlag } from "../types";
import { calculateNormalizedShannonsEntropy } from "../utils";

export function detectNarrowActivityFocus(
	events: IdentifyEvent[],
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	if (events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return flags;
	}

	// Event type diversity check using Shannon's entropy
	// Automated accounts typically have narrow event type profiles (low entropy)
	// Organic accounts engage in varied activities (high entropy)
	const eventTypeMap = new Map<string, number>();
	events.forEach((e) => {
		if (e.type) {
			eventTypeMap.set(e.type, (eventTypeMap.get(e.type) || 0) + 1);
		}
	});

	const eventTypeCount = Array.from(eventTypeMap.values());
	const eventTypeEntropy = calculateNormalizedShannonsEntropy(eventTypeCount);

	const eventTypes = new Set(
		events
			.map((e) => e.type)
			.filter((t): t is string => t !== null && t !== undefined),
	);
	const hasInteraction =
		eventTypes.has("issue-comment") ||
		eventTypes.has("review") ||
		eventTypes.has("review-comment");
	const hasWatches = eventTypes.has("star");

	// Automation indicator: very narrow type profile (few types + low variety) + no interpersonal interactions
	const narrowTypeProfile =
		eventTypes.size <= CONFIG.DIVERSITY_MAX_EVENT_TYPES &&
		eventTypeEntropy < CONFIG.DIVERSITY_MAX_ENTROPY;

	if (narrowTypeProfile && !hasInteraction && !hasWatches) {
		flags.push({
			id: "narrow-activity",
			points: CONFIG.POINTS_LOW_DIVERSITY,
			group: "diversity",
			amplifiable: true,
			facts: { eventTypes: eventTypes.size, entropy: eventTypeEntropy },
			events,
		});
	}

	return flags;
}
