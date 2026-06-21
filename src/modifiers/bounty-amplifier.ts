import { CONFIG } from "../config";
import {
	getBountyPRSignal,
	hasBountyLabelSignal,
} from "../detectors/bounty-repo-activity";
import type { GitHubEvent } from "../types";

export function getBountyAmplifier(events: GitHubEvent[]): number | undefined {
	const prSignal = getBountyPRSignal(events);
	const labelSignal = hasBountyLabelSignal(events);

	if (!prSignal && !labelSignal) return undefined;

	return prSignal === "high"
		? CONFIG.BOUNTY_AMPLIFIER_HIGH
		: CONFIG.BOUNTY_AMPLIFIER_LOW;
}
