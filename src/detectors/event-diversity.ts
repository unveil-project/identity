import { CONFIG } from "../config";
import type { GitHubEvent, IdentifyFlag } from "../types";
import { calculateNormalizedShannonsEntropy } from "../utils";

export function detectNarrowActivityFocus(
	events: GitHubEvent[],
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
		eventTypes.has("IssueCommentEvent") ||
		eventTypes.has("PullRequestReviewEvent") ||
		eventTypes.has("PullRequestReviewCommentEvent");
	const hasWatches = eventTypes.has("WatchEvent");

	// Automation indicator: very narrow type profile (few types + low variety) + no interpersonal interactions
	const narrowTypeProfile = eventTypes.size <= 3 && eventTypeEntropy < 0.8;

	if (narrowTypeProfile && !hasInteraction && !hasWatches) {
		flags.push({
			label: "Narrow activity focus",
			points: CONFIG.POINTS_LOW_DIVERSITY,
			amplifiable: true,
			detail: `${eventTypes.size} event types (entropy: ${eventTypeEntropy.toFixed(2)}) without interpersonal interactions`,
			data: [
				{ label: "Distinct event types", value: eventTypes.size, threshold: 3 },
				{
					label: "Activity entropy",
					value: parseFloat(eventTypeEntropy.toFixed(2)),
					threshold: 0.8,
				},
				{ label: "Has social interactions", value: false },
				{ label: "Has watch activity", value: false },
			],
			events,
		});
	}

	return flags;
}
