import { CONFIG } from "../config";
import { secondsBetween, toTime } from "../time";
import type { IdentifyEvent, IdentifyFlag } from "../types";

export function detectPushBurst(events: IdentifyEvent[]): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	const pushEvents = events
		.filter((e) => e.type === "push")
		.sort((a, b) => toTime(a.at) - toTime(b.at));

	if (pushEvents.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return flags;
	}

	// Detect ultra-tight successive pushes to the same repo.
	// Cross-repo rapid pushes are a different (less diagnostic) pattern — multi-repo
	// CI/CD pipelines legitimately push to many repos in quick succession.
	// Same-repo pushes within seconds are physically implausible for a human.
	let tightBurstCount = 0;
	const tightPushIndices = new Set<number>();

	for (let i = 1; i < pushEvents.length; i++) {
		const prev = pushEvents[i - 1];
		const curr = pushEvents[i];
		if (!prev || !curr || prev.repo !== curr.repo) {
			continue;
		}

		const diffSeconds = Math.trunc(
			secondsBetween(toTime(prev.at), toTime(curr.at)),
		);
		if (diffSeconds <= CONFIG.TIGHT_COMMIT_SECONDS) {
			tightBurstCount++;
			tightPushIndices.add(i - 1);
			tightPushIndices.add(i);
		}
	}

	if (tightBurstCount >= CONFIG.TIGHT_COMMIT_THRESHOLD_GLOBAL) {
		const burstPushEvents = pushEvents.filter((_, i) =>
			tightPushIndices.has(i),
		);

		flags.push({
			id: "push-burst",
			points: CONFIG.POINTS_TIGHT_BURST,
			group: "timing",
			amplifiable: true,
			facts: { pairs: tightBurstCount, pushes: tightPushIndices.size },
			events: burstPushEvents,
		});
	}

	return flags;
}
