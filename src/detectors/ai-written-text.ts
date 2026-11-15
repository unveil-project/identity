import { CONFIG } from "../config";
import { aiTextSignaturesOf } from "../data/ai-text-signatures";
import type { ActivityEvent, Flag } from "../types";

function hasText(event: ActivityEvent): boolean {
	return event.text !== undefined;
}

function signaturesOf(event: ActivityEvent): string[] {
	return aiTextSignaturesOf(event.text ?? "");
}

/** A post where the account's own words say an AI tool wrote it. */
export function isAIWrittenPost(event: ActivityEvent): boolean {
	return signaturesOf(event).length > 0;
}

/**
 * The account's own posts that say an AI tool wrote them, more than once.
 * This is proof that the account uses automation, so it can never be
 * "organic" (see `capForAIAttribution`). Like `ai-agent-app`, the proof adds
 * no penalty. Heavy use gets points from `ai-post-volume`.
 */
export function detectAIWrittenText(events: ActivityEvent[]): Flag[] {
	const allPosts = events.filter(hasText);
	const aiPosts = allPosts.filter(isAIWrittenPost);

	if (aiPosts.length < CONFIG.AI_TEXT_MIN_POSTS) {
		return [];
	}

	const signatures = new Set(aiPosts.flatMap(signaturesOf));

	return [
		{
			id: "ai-written-text",
			points: CONFIG.POINTS_AI_TEXT,
			group: "ai-attribution",
			facts: {
				posts: aiPosts.length,
				allPosts: allPosts.length,
				signatures: [...signatures],
			},
			events: aiPosts,
		},
	];
}
