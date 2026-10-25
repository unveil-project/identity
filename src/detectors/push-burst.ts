import dayjs from "dayjs";
import { CONFIG } from "../config";
import type { IdentifyEvent, IdentifyFlag } from "../types";

export function detectPushBurst(events: IdentifyEvent[]): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	const pushEvents = events
		.filter((e) => e.type === "push")
		.sort((a, b) => dayjs(a.at).valueOf() - dayjs(b.at).valueOf());

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

		const diffSeconds = dayjs(curr.at).diff(dayjs(prev.at), "second");
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
