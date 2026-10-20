import type { GitHubEvent, IdentifyUser } from "./types.ts";

function isBotType(type: string | null | undefined): boolean {
	return typeof type === "string" && type.toLowerCase() === "bot";
}

export function isGitHubAppAccount(
	user: Pick<IdentifyUser, "type">,
	events: readonly GitHubEvent[] = [],
): boolean {
	if (isBotType(user.type)) {
		return true;
	}

	return events.some((event) => isBotType(event.actor?.type));
}
