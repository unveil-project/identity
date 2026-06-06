import dayjs from "dayjs";
import { CONFIG } from "../config";
import type { GitHubEvent, IdentifyFlag } from "../types";

export function detectRepositoryCreationBurst(
	events: GitHubEvent[],
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	if (events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return flags;
	}

	// Filter CreateEvent to only actual repository creations (not branch/tag creation)
	const createEvents = events.filter((e) => {
		return e.type === "CreateEvent" && e.payload?.ref_type === "repository";
	});

	// Rapid repo creation burst (real repository creation clustering)
	if (createEvents.length >= CONFIG.CREATE_EVENTS_MIN) {
		const createTimestamps = createEvents
			.map((e) => dayjs(e.created_at))
			.sort((a, b) => a.valueOf() - b.valueOf());

		// Check for repo creation clustering (multiple repos in short time window)
		let maxCreatesInWindow = 0;
		let windowStartIdx = 0;

		for (let endIdx = 0; endIdx < createTimestamps.length; endIdx++) {
			const windowEnd = createTimestamps[endIdx];

			// Slide window to include only events within 24 hours
			while (
				windowEnd &&
				windowEnd.diff(createTimestamps[windowStartIdx], "hour", true) > 24
			) {
				windowStartIdx++;
			}

			const createsInWindow = endIdx - windowStartIdx + 1;
			maxCreatesInWindow = Math.max(maxCreatesInWindow, createsInWindow);
		}

		if (maxCreatesInWindow >= CONFIG.CREATE_BURST_EXTREME) {
			flags.push({
				label: "Concentrated repository creation",
				points: CONFIG.POINTS_CREATE_BURST_EXTREME,
				detail: `${maxCreatesInWindow} repositories created in a short timeframe (within 24 hours)`,
			});
		} else if (maxCreatesInWindow >= CONFIG.CREATE_BURST_HIGH) {
			flags.push({
				label: "Frequent repository creation",
				points: CONFIG.POINTS_CREATE_BURST_HIGH,
				detail: `${maxCreatesInWindow} repositories created in a short timeframe (within 24 hours)`,
			});
		}
	}

	return flags;
}
