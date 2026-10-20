import { CONFIG } from "./config.ts";
import type { WindowInfo } from "./types.ts";

/**
 * How sure we are about the result, from 0 to 1.
 *
 * It goes up when we see more events, and when those events cover more days.
 */
export function calculateConfidence(window: WindowInfo): number {
	if (window.eventCount === 0) return 0;

	const countConfidence = Math.min(
		1,
		window.eventCount / CONFIG.CONFIDENCE_FULL_EVENTS,
	);
	const spanConfidence = Math.min(
		1,
		window.spanDays / CONFIG.CONFIDENCE_FULL_SPAN_DAYS,
	);

	// The number of events matters more than how long they cover.
	const confidence = 0.7 * countConfidence + 0.3 * spanConfidence;

	return Math.round(Math.min(1, Math.max(0, confidence)) * 100) / 100;
}
