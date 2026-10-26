import { CONFIG } from "../config";
import type { ActivityEvent, Flag } from "../types";

const AI_AGENT_PREFIXES = [
	"codex/",
	"devin/",
	"aider/",
	"copilot/",
	"swe-agent/",
	"swe-bench/",
];

function isAIAgentBranch(ref: string): boolean {
	const lower = ref.toLowerCase();

	return AI_AGENT_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

export function detectAIAgentBranchPrefix(events: ActivityEvent[]): Flag[] {
	const branchCreations = events.filter(
		(e) => e.type === "create" && e.ref?.type === "branch",
	);

	if (branchCreations.length < CONFIG.AI_BRANCH_MIN_CREATIONS) {
		return [];
	}

	const aiBranches = branchCreations.filter((e) =>
		isAIAgentBranch(e.ref?.name ?? ""),
	);
	const ratio = aiBranches.length / branchCreations.length;

	if (ratio < CONFIG.AI_BRANCH_RATIO_MIN) {
		return [];
	}

	const detectedPrefixes = [
		...new Set(
			aiBranches.map((e) => {
				const ref = (e.ref?.name ?? "").toLowerCase();

				return AI_AGENT_PREFIXES.find((p) => ref.startsWith(p)) ?? "";
			}),
		),
	].filter(Boolean);

	return [
		{
			id: "ai-branch-prefix",
			points: CONFIG.POINTS_AI_BRANCH_PREFIX,
			group: "ai-attribution",
			amplifiable: true,
			facts: {
				aiBranches: aiBranches.length,
				branches: branchCreations.length,
				ratio,
				prefixes: detectedPrefixes,
			},
			events: aiBranches,
		},
	];
}
