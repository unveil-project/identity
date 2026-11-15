import { CONFIG } from "../config";
import { isBranchCreation } from "../events";
import type { ActivityEvent, Flag } from "../types";

const AI_AGENT_PREFIXES = [
	"codex/",
	"devin/",
	"aider/",
	"copilot/",
	"claude/",
	"swe-agent/",
	"swe-bench/",
];

/** The AI agent prefix a branch name starts with, if any. */
function aiAgentPrefixOf(branch: ActivityEvent): string | undefined {
	const name = (branch.ref?.name ?? "").toLowerCase();

	return AI_AGENT_PREFIXES.find((prefix) => name.startsWith(prefix));
}

/** Branches the account created with an AI agent prefix, like `codex/fix`. */
export function aiBranchesOf(events: ActivityEvent[]): ActivityEvent[] {
	return events
		.filter(isBranchCreation)
		.filter((branch) => aiAgentPrefixOf(branch) !== undefined);
}

/**
 * Branches named by an AI agent, more than once. This is proof that the
 * account uses automation, so it can never be "organic" (see
 * `capForAIAttribution`). We count branches, not their share of all
 * branches: a share hides a habit on a busy account.
 */
export function detectAIAgentBranchPrefix(events: ActivityEvent[]): Flag[] {
	const aiBranches = aiBranchesOf(events);

	if (aiBranches.length < CONFIG.AI_BRANCH_MIN) {
		return [];
	}

	const branches = events.filter(isBranchCreation);
	const prefixes = new Set(
		aiBranches.map(aiAgentPrefixOf).filter((prefix) => prefix !== undefined),
	);

	return [
		{
			id: "ai-branch-prefix",
			points: CONFIG.POINTS_AI_BRANCH_PREFIX,
			group: "ai-attribution",
			amplifiable: true,
			facts: {
				aiBranches: aiBranches.length,
				branches: branches.length,
				ratio: aiBranches.length / branches.length,
				prefixes: [...prefixes],
			},
			events: aiBranches,
		},
	];
}
