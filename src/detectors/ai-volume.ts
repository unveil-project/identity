import { CONFIG } from "../config";
import { densestEventWindow } from "../events";
import type { ActivityEvent, Flag } from "../types";
import { type RampAnchor, rampPoints } from "../utils";
import { isAIAgentPost } from "./ai-agent-app";
import { aiBranchesOf } from "./ai-branch-prefix";

const AI_BRANCH_DAY_RAMP: readonly RampAnchor[] = [
	[CONFIG.AI_BRANCHES_DAY_LIGHT, 0],
	[CONFIG.AI_BRANCHES_DAY_HEAVY, CONFIG.POINTS_AI_BRANCHES_DAY_HEAVY],
	[CONFIG.AI_BRANCHES_DAY_EXTREME, CONFIG.POINTS_AI_BRANCHES_DAY_EXTREME],
];

const AI_POST_DAY_RAMP: readonly RampAnchor[] = [
	[CONFIG.AI_POSTS_DAY_LIGHT, 0],
	[CONFIG.AI_POSTS_DAY_HEAVY, CONFIG.POINTS_AI_POSTS_DAY_HEAVY],
	[CONFIG.AI_POSTS_DAY_EXTREME, CONFIG.POINTS_AI_POSTS_DAY_EXTREME],
];

/** The busiest day of AI agent branches. */
function detectAIBranchVolume(events: ActivityEvent[]): Flag[] {
	const aiBranches = aiBranchesOf(events);
	const day = densestEventWindow(aiBranches, 24);
	const points = rampPoints(day.count, AI_BRANCH_DAY_RAMP);

	if (points === 0) {
		return [];
	}

	return [
		{
			id: "ai-branch-volume",
			points,
			group: "ai-attribution",
			amplifiable: true,
			facts: { busiestDay: day.count, aiBranches: aiBranches.length },
			events: day.items,
		},
	];
}

/** The busiest day of posts that an AI agent app made for the account. */
function detectAIPostVolume(events: ActivityEvent[]): Flag[] {
	const aiPosts = events.filter(isAIAgentPost);
	const day = densestEventWindow(aiPosts, 24);
	const points = rampPoints(day.count, AI_POST_DAY_RAMP);

	if (points === 0) {
		return [];
	}

	return [
		{
			id: "ai-post-volume",
			points,
			group: "ai-attribution",
			amplifiable: true,
			facts: {
				busiestDay: day.count,
				aiPosts: aiPosts.length,
			},
			events: day.items,
		},
	];
}

/**
 * Using an AI agent is not spam, so the proof flags take no points. Using it
 * this much in one day is automation, so these flags do.
 */
export function detectAIVolume(events: ActivityEvent[]): Flag[] {
	return [...detectAIBranchVolume(events), ...detectAIPostVolume(events)];
}
