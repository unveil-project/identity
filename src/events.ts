import { CONFIG } from "./config";
import { isExternalRepo, isOwnRepo, ownerOf } from "./repos";
import { isValidTime, toTime } from "./time";
import type { ActivityEvent } from "./types";
import { countBy, type DensestWindow, densestWindow } from "./utils";

export function isOpenedPR(event: ActivityEvent): boolean {
	return event.type === "pull-request" && event.action === "opened";
}

export function isBranchCreation(event: ActivityEvent): boolean {
	return event.type === "create" && event.ref?.type === "branch";
}

export function isRepoCreation(event: ActivityEvent): boolean {
	return event.type === "create" && event.ref?.type === "repository";
}

export function eventTime(event: ActivityEvent): number {
	return toTime(event.at);
}

export type TimedEvent = {
	event: ActivityEvent;
	time: number;
};

/**
 * The events with their time read once, oldest first. Events without a
 * readable time are left out, because they cannot be placed in order.
 */
export function toTimeline(events: readonly ActivityEvent[]): TimedEvent[] {
	return events
		.map((event) => ({ event, time: eventTime(event) }))
		.filter((entry) => isValidTime(entry.time))
		.sort((a, b) => a.time - b.time);
}

/** `densestWindow` for activity events. */
export function densestEventWindow(
	events: readonly ActivityEvent[],
	windowHours: number,
): DensestWindow<ActivityEvent> {
	return densestWindow(events, eventTime, windowHours);
}

/** The events on repositories the account does not own. */
export function externalEventsOf(
	events: readonly ActivityEvent[],
	login: string,
): ActivityEvent[] {
	return events.filter((event) => isExternalRepo(event.repo, login));
}

/**
 * Repositories owned by someone else that the account pushed to or created a
 * branch or tag in. Both need write access, which a maintainer had to grant,
 * so the account works there as a collaborator, not as an outsider.
 */
export function collaboratorReposOf(
	events: readonly ActivityEvent[],
	login: string,
): Set<string> {
	const writes = externalEventsOf(events, login).filter(
		(event) => event.type === "push" || event.type === "create",
	);

	return new Set(writes.map((event) => event.repo));
}

/**
 * Repos the account can push to: the ones it owns, and the ones where it
 * works as a collaborator (see `collaboratorReposOf`).
 */
export function pushAccessReposOf(
	events: readonly ActivityEvent[],
	login: string,
): Set<string> {
	const ownRepos = events
		.map((event) => event.repo)
		.filter((repo) => isOwnRepo(repo, login));

	return new Set([...ownRepos, ...collaboratorReposOf(events, login)]);
}

/**
 * True when most of the activity on other people's repos happens under one
 * owner: the organization the account works for, or the project it helps run.
 * That owner is the account's home, even without repositories of its own.
 * Spam goes the other way and spreads over many owners.
 */
export function hasHomeOwner(
	externalEvents: readonly ActivityEvent[],
): boolean {
	if (externalEvents.length === 0) {
		return false;
	}

	const eventsPerOwner = countBy(externalEvents, (event) =>
		ownerOf(event.repo).toLowerCase(),
	);
	const busiestOwner = Math.max(...eventsPerOwner.values());

	return busiestOwner / externalEvents.length >= CONFIG.HOME_OWNER_MIN_SHARE;
}
