import { CONFIG } from "../config";
import type { GitHubEvent, IdentifyFlag } from "../types";

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

export function detectAIAgentBranchPrefix(
	events: GitHubEvent[],
): IdentifyFlag[] {
	const branchCreations = events.filter(
		(e) => e.type === "CreateEvent" && e.payload?.ref_type === "branch",
	);

	if (branchCreations.length < CONFIG.AI_BRANCH_MIN_CREATIONS) return [];

	const aiBranches = branchCreations.filter((e) =>
		isAIAgentBranch(e.payload?.ref ?? ""),
	);
	const ratio = aiBranches.length / branchCreations.length;

	if (ratio < CONFIG.AI_BRANCH_RATIO_MIN) return [];

	const detectedPrefixes = [
		...new Set(
			aiBranches.map((e) => {
				const ref = (e.payload?.ref ?? "").toLowerCase();
				return AI_AGENT_PREFIXES.find((p) => ref.startsWith(p)) ?? "";
			}),
		),
	].filter(Boolean);

	return [
		{
			label: "AI agent branch naming pattern",
			points: CONFIG.POINTS_AI_BRANCH_PREFIX,
			amplifiable: true,
			detail: `${aiBranches.length}/${branchCreations.length} branches use AI agent tool prefixes (${detectedPrefixes.join(", ")})`,
			data: [
				{ label: "AI-prefixed branches", value: aiBranches.length },
				{
					label: "Total branches",
					value: branchCreations.length,
					threshold: CONFIG.AI_BRANCH_MIN_CREATIONS,
				},
				{
					label: "AI branch ratio",
					value: `${Math.round(ratio * 100)}%`,
					threshold: `${Math.round(CONFIG.AI_BRANCH_RATIO_MIN * 100)}%`,
				},
				{ label: "Detected prefixes", value: detectedPrefixes.join(", ") },
			],
			events: aiBranches,
		},
	];
}
