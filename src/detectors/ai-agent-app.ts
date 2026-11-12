import { CONFIG } from "../config";
import { AI_AGENT_APPS } from "../data/ai-agent-apps";
import type { ActivityEvent, Flag } from "../types";

/**
 * A post is a comment the account wrote on an issue or a pull request, or an
 * issue it opened. Only posts can name the app that made them.
 */
function isPost(event: ActivityEvent): boolean {
	const isNewIssue = event.type === "issue" && event.action === "opened";

	return event.type === "issue-comment" || isNewIssue;
}

function isAIAgentPost(event: ActivityEvent): boolean {
	return event.viaApp !== undefined && AI_AGENT_APPS.has(event.viaApp);
}

/**
 * Comments and issues that an AI agent posted for the account, more than
 * once. This is proof that the account uses automation, so it can never be
 * "organic" (see `capForAIAgentUse`). The proof adds no penalty: using an
 * agent is not spam. Whether the account is "automation" depends on how it
 * behaves, and the other checks measure that.
 */
export function detectAIAgentApp(events: ActivityEvent[]): Flag[] {
	const allPosts = events.filter(isPost);
	const agentPosts = allPosts.filter(isAIAgentPost);

	// One post can be a trial or an accident. More than one means the account
	// came back to the agent. We count posts, not their share of all posts:
	// a share makes one post look big on a quiet account, and hides a habit
	// on a busy one.
	if (agentPosts.length < CONFIG.AI_AGENT_APP_MIN_POSTS) {
		return [];
	}

	const apps = new Set(
		agentPosts.map((post) => post.viaApp).filter((app) => app !== undefined),
	);

	return [
		{
			id: "ai-agent-app",
			points: CONFIG.POINTS_AI_AGENT_APP,
			group: "ai-attribution",
			facts: {
				posts: agentPosts.length,
				allPosts: allPosts.length,
				apps: [...apps],
			},
			events: agentPosts,
		},
	];
}
