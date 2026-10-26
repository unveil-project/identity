import { CONFIG } from "../config";
import { minutesBetween, secondsBetween, toTime } from "../time";
import type { ActivityEvent, EventConnection, Flag } from "../types";

type EventEntry = { event: ActivityEvent; time: number };

export function detectCommentBeforePR(events: ActivityEvent[]): Flag[] {
	const issueCommentEvents = events.filter((e) => e.type === "issue-comment");
	const prOpenEvents = events.filter(
		(e) => e.type === "pull-request" && e.action === "opened",
	);

	if (issueCommentEvents.length === 0 || prOpenEvents.length === 0) {
		return [];
	}

	const commentsByRepo = new Map<string, EventEntry[]>();
	for (const e of issueCommentEvents) {
		const repo = e.repo;
		if (!repo) {
			continue;
		}

		if (!commentsByRepo.has(repo)) {
			commentsByRepo.set(repo, []);
		}

		commentsByRepo.get(repo)?.push({ event: e, time: toTime(e.at) });
	}

	const prsByRepo = new Map<string, EventEntry[]>();
	for (const e of prOpenEvents) {
		const repo = e.repo;
		if (!repo) {
			continue;
		}

		if (!prsByRepo.has(repo)) {
			prsByRepo.set(repo, []);
		}

		prsByRepo.get(repo)?.push({ event: e, time: toTime(e.at) });
	}

	const veryFastRepos = new Set<string>();
	const matchedPairs: EventConnection[] = [];
	let fastestSeconds = Infinity;

	for (const [repo, commentEntries] of commentsByRepo) {
		const prEntries = prsByRepo.get(repo);
		if (!prEntries) {
			continue;
		}

		for (const commentEntry of commentEntries) {
			for (const prEntry of prEntries) {
				const diffMinutes = minutesBetween(commentEntry.time, prEntry.time);

				if (
					diffMinutes > 0 &&
					diffMinutes < CONFIG.COMMENT_BEFORE_PR_VERY_FAST_MINUTES
				) {
					veryFastRepos.add(repo);
					matchedPairs.push({ from: commentEntry.event, to: prEntry.event });
					const diffSeconds = secondsBetween(commentEntry.time, prEntry.time);

					if (diffSeconds < fastestSeconds) {
						fastestSeconds = diffSeconds;
					}
				}
			}
		}
	}

	if (veryFastRepos.size >= CONFIG.COMMENT_BEFORE_PR_VERY_FAST_MIN_REPOS) {
		const fastest =
			fastestSeconds === Infinity ? 0 : Math.round(fastestSeconds);
		const pairedEvents = [
			...new Set(matchedPairs.flatMap((p) => [p.from, p.to])),
		];

		return [
			{
				id: "comment-pr-fast",
				points: CONFIG.POINTS_COMMENT_BEFORE_PR_VERY_FAST,
				group: "comment-pr-timing",
				amplifiable: true,
				facts: { repos: veryFastRepos.size, fastestSeconds: fastest },
				events: pairedEvents,
				connections: matchedPairs,
			},
		];
	}

	return [];
}
