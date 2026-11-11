import { CONFIG } from "../config";
import { collaboratorReposOf, isOpenedPR, toTimeline } from "../events";
import { isExternalRepo } from "../repos";
import { minutesBetween, secondsBetween } from "../time";
import type { ActivityEvent, EventConnection, Flag } from "../types";
import { groupBy } from "../utils";

/**
 * Commenting on an issue and opening a PR to the same repository a few minutes
 * later leaves no time to read the code, write a fix and push it. Seen in
 * several repositories, it points at an agent that claims issues and submits
 * ready-made PRs.
 *
 * Only repositories where the account is an outsider count. Maintainers and
 * collaborators often answer an issue and open the fix they already had
 * straight away.
 */
export function detectCommentBeforePR(
	events: ActivityEvent[],
	accountName: string,
): Flag[] {
	const collaboratorRepos = collaboratorReposOf(events, accountName);
	const isOutsiderIn = (repo: string) =>
		isExternalRepo(repo, accountName) && !collaboratorRepos.has(repo);

	const comments = toTimeline(
		events.filter(
			(event) => event.type === "issue-comment" && isOutsiderIn(event.repo),
		),
	);
	const prs = toTimeline(
		events.filter((event) => isOpenedPR(event) && isOutsiderIn(event.repo)),
	);
	const prsByRepo = groupBy(prs, (pr) => pr.event.repo);

	const fastRepos = new Set<string>();
	const connections: EventConnection[] = [];
	let fastestSeconds = Number.POSITIVE_INFINITY;

	for (const comment of comments) {
		for (const pr of prsByRepo.get(comment.event.repo) ?? []) {
			const gapMinutes = minutesBetween(comment.time, pr.time);
			const isVeryFast =
				gapMinutes > 0 &&
				gapMinutes < CONFIG.COMMENT_BEFORE_PR_VERY_FAST_MINUTES;

			if (isVeryFast) {
				fastRepos.add(comment.event.repo);
				connections.push({ from: comment.event, to: pr.event });
				fastestSeconds = Math.min(
					fastestSeconds,
					secondsBetween(comment.time, pr.time),
				);
			}
		}
	}

	if (fastRepos.size < CONFIG.COMMENT_BEFORE_PR_VERY_FAST_MIN_REPOS) {
		return [];
	}

	const pairedEvents = new Set(
		connections.flatMap((connection) => [connection.from, connection.to]),
	);

	return [
		{
			id: "comment-pr-fast",
			points: CONFIG.POINTS_COMMENT_BEFORE_PR_VERY_FAST,
			group: "comment-pr-timing",
			amplifiable: true,
			facts: {
				repos: fastRepos.size,
				fastestSeconds: Math.round(fastestSeconds),
			},
			events: [...pairedEvents],
			connections,
		},
	];
}
