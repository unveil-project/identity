import { CONFIG } from "../config";
import { toTimeline } from "../events";
import { secondsBetween } from "../time";
import type { ActivityEvent, Flag } from "../types";

/**
 * Count back-to-back pushes to the same repository that land within a few
 * minutes of each other. People push in quick bursts too (fixing a failing CI
 * run, for example), so only a very high number of pairs counts.
 *
 * Pushes to different repositories are left out: deploy scripts and monorepo
 * tools push to many repositories at once, which says little about who is
 * pushing.
 */
export function detectPushBurst(events: ActivityEvent[]): Flag[] {
	const pushes = toTimeline(events.filter((event) => event.type === "push"));

	if (pushes.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return [];
	}

	let pairs = 0;
	const burstIndexes = new Set<number>();

	for (let i = 1; i < pushes.length; i++) {
		const previous = pushes[i - 1];
		const current = pushes[i];
		if (!previous || !current || previous.event.repo !== current.event.repo) {
			continue;
		}

		const gapSeconds = Math.trunc(secondsBetween(previous.time, current.time));
		if (gapSeconds <= CONFIG.TIGHT_COMMIT_SECONDS) {
			pairs++;
			burstIndexes.add(i - 1);
			burstIndexes.add(i);
		}
	}

	if (pairs < CONFIG.TIGHT_COMMIT_THRESHOLD_GLOBAL) {
		return [];
	}

	const burstPushes = pushes
		.filter((_, index) => burstIndexes.has(index))
		.map((entry) => entry.event);

	return [
		{
			id: "push-burst",
			points: CONFIG.POINTS_TIGHT_BURST,
			group: "timing",
			amplifiable: true,
			facts: { pairs, pushes: burstIndexes.size },
			events: burstPushes,
		},
	];
}
