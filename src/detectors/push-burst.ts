import dayjs from "dayjs";
import { CONFIG } from "../config";
import type { GitHubEvent, IdentifyFlag } from "../types";

export function detectPushBurst(events: GitHubEvent[]): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	const pushEvents = events
		.filter((e) => e.type === "PushEvent")
		.sort((a, b) => dayjs(a.created_at).valueOf() - dayjs(b.created_at).valueOf());

	if (pushEvents.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return flags;
	}

	// Detect ultra-tight successive pushes to the same repo.
	// Cross-repo rapid pushes are a different (less diagnostic) pattern — multi-repo
	// CI/CD pipelines legitimately push to many repos in quick succession.
	// Same-repo pushes within seconds are physically implausible for a human.
	let tightBurstCount = 0;

	for (let i = 1; i < pushEvents.length; i++) {
		const prev = pushEvents[i - 1];
		const curr = pushEvents[i];
		if (!prev || !curr || prev.repo?.name !== curr.repo?.name) continue;
		const diffSeconds = dayjs(curr.created_at).diff(dayjs(prev.created_at), "second");
		if (diffSeconds <= CONFIG.TIGHT_COMMIT_SECONDS) {
			tightBurstCount++;
		}
	}

	if (tightBurstCount >= CONFIG.TIGHT_COMMIT_THRESHOLD_GLOBAL) {
		flags.push({
			label: "High push frequency",
			points: CONFIG.POINTS_TIGHT_BURST,
			amplifiable: true,
			detail: `${tightBurstCount + 1} pushes to the same repository within very short intervals`,
		});
	}

	return flags;
}
