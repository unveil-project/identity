/**
 * GitHub Apps that are AI coding agents: the app's slug, and the name people
 * know the agent by. When one of these apps posts a comment or an issue for
 * an account, GitHub names the app on it. Add an app only after you see it
 * post for real accounts.
 */
export const AI_AGENT_APPS: ReadonlyMap<string, string> = new Map([
	["chatgpt-codex-connector", "Codex"],
	["claude", "Claude"],
	["cursor", "Cursor"],
]);
