import dayjs from "dayjs";
import { CONFIG } from "../config";
import type { EventConnection, GitHubEvent, IdentifyFlag } from "../types";

type EventEntry = { event: GitHubEvent; time: dayjs.Dayjs };

export function detectCommentBeforePR(events: GitHubEvent[]): IdentifyFlag[] {
	const issueCommentEvents = events.filter(
		(e) => e.type === "IssueCommentEvent",
	);
	const prOpenEvents = events.filter(
		(e) => e.type === "PullRequestEvent" && e.payload?.action === "opened",
	);

	if (issueCommentEvents.length === 0 || prOpenEvents.length === 0) return [];

	const commentsByRepo = new Map<string, EventEntry[]>();
	for (const e of issueCommentEvents) {
		const repo = e.repo?.name;
		if (!repo) continue;
		if (!commentsByRepo.has(repo)) commentsByRepo.set(repo, []);
		commentsByRepo.get(repo)?.push({ event: e, time: dayjs(e.created_at) });
	}

	const prsByRepo = new Map<string, EventEntry[]>();
	for (const e of prOpenEvents) {
		const repo = e.repo?.name;
		if (!repo) continue;
		if (!prsByRepo.has(repo)) prsByRepo.set(repo, []);
		prsByRepo.get(repo)?.push({ event: e, time: dayjs(e.created_at) });
	}

	const veryFastRepos = new Set<string>();
	const matchedPairs: EventConnection[] = [];
	let fastestSeconds = Infinity;

	for (const [repo, commentEntries] of commentsByRepo) {
		const prEntries = prsByRepo.get(repo);
		if (!prEntries) continue;

		for (const commentEntry of commentEntries) {
			for (const prEntry of prEntries) {
				const diffMinutes = prEntry.time.diff(
					commentEntry.time,
					"minute",
					true,
				);
				if (
					diffMinutes > 0 &&
					diffMinutes < CONFIG.COMMENT_BEFORE_PR_VERY_FAST_MINUTES
				) {
					veryFastRepos.add(repo);
					matchedPairs.push({ from: commentEntry.event, to: prEntry.event });
					const diffSeconds = prEntry.time.diff(
						commentEntry.time,
						"second",
						true,
					);
					if (diffSeconds < fastestSeconds) fastestSeconds = diffSeconds;
				}
			}
		}
	}

	if (veryFastRepos.size >= CONFIG.COMMENT_BEFORE_PR_VERY_FAST_MIN_REPOS) {
		const fastest =
			fastestSeconds === Infinity ? 0 : Math.round(fastestSeconds);
		const fastRepoEvents = [...issueCommentEvents, ...prOpenEvents].filter(
			(e) => e.repo?.name && veryFastRepos.has(e.repo.name),
		);
		return [
			{
				label: "Issue comment and PR within minutes",
				points: CONFIG.POINTS_COMMENT_BEFORE_PR_VERY_FAST,
				amplifiable: true,
				detail: `Issue comment and PR to the same repository within ${CONFIG.COMMENT_BEFORE_PR_VERY_FAST_MINUTES} minutes, across ${veryFastRepos.size} repositories (shortest gap: ${fastest}s)`,
				data: [
					{
						label: "Repos with fast comment→PR",
						value: veryFastRepos.size,
						threshold: CONFIG.COMMENT_BEFORE_PR_VERY_FAST_MIN_REPOS,
					},
					{ label: "Shortest gap (s)", value: fastest },
					{
						label: "Window (min)",
						value: CONFIG.COMMENT_BEFORE_PR_VERY_FAST_MINUTES,
					},
				],
				events: fastRepoEvents,
				connections: matchedPairs,
			},
		];
	}

	return [];
}
