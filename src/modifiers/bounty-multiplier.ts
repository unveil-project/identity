import { CONFIG } from "../config";
import { getBountyPRSignal } from "../detectors/bounty-repo-activity";
import type { GitHubEvent } from "../types";

export function getBountyMultiplier(events: GitHubEvent[]): number | undefined {
	const prSignal = getBountyPRSignal(events);
	if (!prSignal) return undefined;
	return prSignal === "high"
		? CONFIG.BOUNTY_MULTIPLIER_HIGH
		: CONFIG.BOUNTY_MULTIPLIER_LOW;
}
