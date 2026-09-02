import type { GitHubEvent, IdentifyUser } from "./types";

/**
 * GitHub App accounts always carry the `[bot]` suffix in their login.
 * Square brackets are not valid in a normal login, so nothing else can
 * claim the suffix.
 */
const APP_LOGIN_SUFFIX = "[bot]";

function isBotType(type: string | null | undefined): boolean {
	return typeof type === "string" && type.toLowerCase() === "bot";
}

function hasAppLogin(login: string | null | undefined): boolean {
	return (
		typeof login === "string" && login.toLowerCase().endsWith(APP_LOGIN_SUFFIX)
	);
}

export function isGitHubAppAccount(
	user: Pick<IdentifyUser, "login" | "type">,
	events: readonly GitHubEvent[] = [],
): boolean {
	if (isBotType(user.type)) {
		return true;
	}

	if (hasAppLogin(user.login)) {
		return true;
	}

	const login = user.login?.toLowerCase();

	return events.some((e) => {
		const actor = e.actor as { login?: string; type?: string } | undefined;

		if (!actor) {
			return false;
		}

		if (actor.login?.toLowerCase() !== login) {
			return false;
		}

		return isBotType(actor.type);
	});
}
