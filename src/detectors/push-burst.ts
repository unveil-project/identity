import dayjs from "dayjs";
import { CONFIG } from "../config";
import type { GitHubEvent, IdentifyFlag } from "../types";

export function detectPushBurst(events: GitHubEvent[]): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	const pushEvents = events
		.filter((e) => e.type === "PushEvent")
		.sort(
			(a, b) => dayjs(a.created_at).valueOf() - dayjs(b.created_at).valueOf(),
		);

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
		if (!prev || !curr || prev.repo?.name !== curr.repo?.name) continue;
		const diffSeconds = dayjs(curr.created_at).diff(
			dayjs(prev.created_at),
			"second",
		);
		if (diffSeconds <= CONFIG.TIGHT_COMMIT_SECONDS) {
			tightBurstCount++;
			tightPushIndices.add(i - 1);
			tightPushIndices.add(i);
		}
	}

	if (tightBurstCount >= CONFIG.TIGHT_COMMIT_THRESHOLD_GLOBAL) {
		const windowMinutes = Math.round(CONFIG.TIGHT_COMMIT_SECONDS / 60);
		const burstPushEvents = pushEvents.filter((_, i) =>
			tightPushIndices.has(i),
		);
		flags.push({
			label: "High push frequency",
			points: CONFIG.POINTS_TIGHT_BURST,
			amplifiable: true,
			detail: `${tightBurstCount} consecutive same-repo push pairs within ${windowMinutes} min of each other (${tightPushIndices.size} pushes involved)`,
			data: [
				{
					label: "Rapid push pairs",
					value: tightBurstCount,
					threshold: CONFIG.TIGHT_COMMIT_THRESHOLD_GLOBAL,
				},
				{ label: "Pushes involved", value: tightPushIndices.size },
				{ label: "Max interval (s)", value: CONFIG.TIGHT_COMMIT_SECONDS },
			],
			events: burstPushEvents,
		});
	}

	return flags;
}
