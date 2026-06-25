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
		const sortedCreateEvents = [...createEvents].sort(
			(a, b) => dayjs(a.created_at).valueOf() - dayjs(b.created_at).valueOf(),
		);
		const createTimestamps = sortedCreateEvents.map((e) => dayjs(e.created_at));

		// Check for repo creation clustering (multiple repos in short time window)
		let maxCreatesInWindow = 0;
		let maxWindowStartIdx = 0;
		let maxWindowEndIdx = 0;
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

		if (maxCreatesInWindow >= CONFIG.CREATE_BURST_EXTREME) {
			flags.push({
				label: "Concentrated repository creation",
				points: CONFIG.POINTS_CREATE_BURST_EXTREME,
				amplifiable: true,
				detail: `${maxCreatesInWindow} repositories created in a short timeframe (within 24 hours)`,
				data: [
					{ label: "Repos created in 24h", value: maxCreatesInWindow, threshold: CONFIG.CREATE_BURST_EXTREME },
					{ label: "Total repo creations", value: createEvents.length },
				],
				events: burstEvents,
			});
		} else if (maxCreatesInWindow >= CONFIG.CREATE_BURST_HIGH) {
			flags.push({
				label: "Frequent repository creation",
				points: CONFIG.POINTS_CREATE_BURST_HIGH,
				amplifiable: true,
				detail: `${maxCreatesInWindow} repositories created in a short timeframe (within 24 hours)`,
				data: [
					{ label: "Repos created in 24h", value: maxCreatesInWindow, threshold: CONFIG.CREATE_BURST_HIGH },
					{ label: "Total repo creations", value: createEvents.length },
				],
				events: burstEvents,
			});
		}
	}

	return flags;
}
