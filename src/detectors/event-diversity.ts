import type { IdentifyFlag, GitHubEvent } from "../types";
import { CONFIG } from "../config";
import { calculateNormalizedShannonsEntropy } from "../utils";

export function detectNarrowActivityFocus(
  filteredEvents: GitHubEvent[],
): IdentifyFlag[] {
  const flags: IdentifyFlag[] = [];

  if (filteredEvents.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
    return flags;
  }

  // Event type diversity check using Shannon's entropy
  // Bots typically have narrow event type profiles (low entropy)
  // Humans engage in varied activities (high entropy)
  const eventTypeMap = new Map<string, number>();
  filteredEvents.forEach((e) => {
    if (e.type) {
      eventTypeMap.set(e.type, (eventTypeMap.get(e.type) || 0) + 1);
    }
  });

  const eventTypeCount = Array.from(eventTypeMap.values());
  const eventTypeEntropy = calculateNormalizedShannonsEntropy(eventTypeCount);

  const eventTypes = new Set(
    filteredEvents
      .map((e) => e.type)
      .filter((t): t is string => t !== null && t !== undefined),
  );
  const hasInteraction =
    eventTypes.has("IssueCommentEvent") ||
    eventTypes.has("PullRequestReviewEvent") ||
    eventTypes.has("PullRequestReviewCommentEvent");
  const hasWatches = eventTypes.has("WatchEvent");

  // Pure automation indicator:
  // Very narrow type profile (few types + low variety) + no human interactions
  // OR: HIGH event type entropy (many types with equal distribution - automated cycling)
  const narrowTypeProfile = eventTypes.size <= 3 && eventTypeEntropy < 0.8;
  const automatedCycling = eventTypeEntropy > 0.85 && eventTypes.size >= 5;

  if (
    (narrowTypeProfile || automatedCycling) &&
    !hasInteraction &&
    !hasWatches
  ) {
    flags.push({
      label: "Narrow activity focus",
      points: CONFIG.POINTS_LOW_DIVERSITY,
      detail: `${eventTypes.size} event types (entropy: ${eventTypeEntropy.toFixed(2)}) without interpersonal interactions`,
    });
  }

  return flags;
}
