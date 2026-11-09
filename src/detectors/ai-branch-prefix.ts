import { CONFIG } from "../config";
import { isBranchCreation } from "../events";
import type { ActivityEvent, Flag } from "../types";

const AI_AGENT_PREFIXES = [
	"codex/",
	"devin/",
	"aider/",
	"copilot/",
	"swe-agent/",
	"swe-bench/",
];

/** The AI agent prefix a branch name starts with, if any. */
function aiAgentPrefixOf(branch: ActivityEvent): string | undefined {
	const name = (branch.ref?.name ?? "").toLowerCase();

	return AI_AGENT_PREFIXES.find((prefix) => name.startsWith(prefix));
}

export function detectAIAgentBranchPrefix(events: ActivityEvent[]): Flag[] {
	const branches = events.filter(isBranchCreation);

	if (branches.length < CONFIG.AI_BRANCH_MIN_CREATIONS) {
		return [];
	}

	const aiBranches = branches.filter(
		(branch) => aiAgentPrefixOf(branch) !== undefined,
	);
	const ratio = aiBranches.length / branches.length;

	if (ratio < CONFIG.AI_BRANCH_RATIO_MIN) {
		return [];
	}

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
				ratio,
				prefixes: [...prefixes],
			},
			events: aiBranches,
		},
	];
}
