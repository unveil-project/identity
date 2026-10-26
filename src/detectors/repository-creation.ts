import { CONFIG } from "../config";
import { hoursBetween, toTime } from "../time";
import type { ActivityEvent, Flag } from "../types";
import { type RampAnchor, rampPoints } from "../utils";

const CREATE_BURST_RAMP: readonly RampAnchor[] = [
	[CONFIG.CREATE_BURST_HIGH, CONFIG.POINTS_CREATE_BURST_HIGH],
	[CONFIG.CREATE_BURST_EXTREME, CONFIG.POINTS_CREATE_BURST_EXTREME],
];

export function detectRepositoryCreationBurst(events: ActivityEvent[]): Flag[] {
	const flags: Flag[] = [];

	if (events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return flags;
	}

	// Filter CreateEvent to only actual repository creations (not branch/tag creation)
	const createEvents = events.filter((e) => {
		return e.type === "create" && e.ref?.type === "repository";
	});

	// Rapid repo creation burst (real repository creation clustering)
	if (createEvents.length >= CONFIG.CREATE_EVENTS_MIN) {
		const sortedCreateEvents = [...createEvents].sort(
			(a, b) => toTime(a.at) - toTime(b.at),
		);
		const createTimestamps = sortedCreateEvents.map((e) => toTime(e.at));

		// Check for repo creation clustering (multiple repos in short time window)
		let maxCreatesInWindow = 0;
		let maxWindowStartIdx = 0;
		let maxWindowEndIdx = 0;
		let windowStartIdx = 0;

		for (let endIdx = 0; endIdx < createTimestamps.length; endIdx++) {
			const windowEnd = createTimestamps[endIdx];
			let windowStart = createTimestamps[windowStartIdx];

			// Slide window to include only events within 24 hours
			while (
				windowStart !== undefined &&
				windowEnd &&
				hoursBetween(windowStart, windowEnd) > 24
			) {
				windowStartIdx++;
				windowStart = createTimestamps[windowStartIdx];
			}

			const createsInWindow = endIdx - windowStartIdx + 1;
			if (createsInWindow > maxCreatesInWindow) {
				maxCreatesInWindow = createsInWindow;
				maxWindowStartIdx = windowStartIdx;
				maxWindowEndIdx = endIdx;
			}
		}

		const burstEvents = sortedCreateEvents.slice(
			maxWindowStartIdx,
			maxWindowEndIdx + 1,
		);

		const burstPoints = rampPoints(maxCreatesInWindow, CREATE_BURST_RAMP);

		if (maxCreatesInWindow >= CONFIG.CREATE_BURST_EXTREME) {
			flags.push({
				id: "repo-creation-extreme",
				points: burstPoints,
				group: "repo-creation",
				amplifiable: true,
				facts: {
					created: maxCreatesInWindow,
					totalCreated: createEvents.length,
				},
				events: burstEvents,
			});
		} else if (maxCreatesInWindow >= CONFIG.CREATE_BURST_HIGH) {
			flags.push({
				id: "repo-creation-high",
				points: burstPoints,
				group: "repo-creation",
				amplifiable: true,
				facts: {
					created: maxCreatesInWindow,
					totalCreated: createEvents.length,
				},
				events: burstEvents,
			});
		}
	}

	return flags;
}
