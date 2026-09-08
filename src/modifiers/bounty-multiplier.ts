import { CONFIG } from "../config.ts";
import { getBountyPRSignal } from "../detectors/bounty-repo-activity.ts";
import type { GitHubEvent } from "../types.ts";

export function getBountyMultiplier(events: GitHubEvent[]): number | undefined {
	const prSignal = getBountyPRSignal(events);
	if (!prSignal) return undefined;
	return prSignal === "high"
		? CONFIG.BOUNTY_MULTIPLIER_HIGH
		: CONFIG.BOUNTY_MULTIPLIER_LOW;
}
