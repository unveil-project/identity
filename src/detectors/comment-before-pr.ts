import dayjs from "dayjs";
import { CONFIG } from "../config";
import type { GitHubEvent, IdentifyFlag } from "../types";

export function detectCommentBeforePR(events: GitHubEvent[]): IdentifyFlag[] {
	const issueCommentEvents = events.filter(
		(e) => e.type === "IssueCommentEvent",
	);
	const prOpenEvents = events.filter(
		(e) => e.type === "PullRequestEvent" && e.payload?.action === "opened",
	);

	if (issueCommentEvents.length === 0 || prOpenEvents.length === 0) return [];

	const commentsByRepo = new Map<string, dayjs.Dayjs[]>();
	for (const e of issueCommentEvents) {
		const repo = e.repo?.name;
		if (!repo) continue;
		if (!commentsByRepo.has(repo)) commentsByRepo.set(repo, []);
		commentsByRepo.get(repo)?.push(dayjs(e.created_at));
	}

	const prsByRepo = new Map<string, dayjs.Dayjs[]>();
	for (const e of prOpenEvents) {
		const repo = e.repo?.name;
		if (!repo) continue;
		if (!prsByRepo.has(repo)) prsByRepo.set(repo, []);
		prsByRepo.get(repo)?.push(dayjs(e.created_at));
	}

	const veryFastRepos = new Set<string>();

	for (const [repo, commentTimes] of commentsByRepo) {
		const prTimes = prsByRepo.get(repo);
		if (!prTimes) continue;

		for (const commentTime of commentTimes) {
			for (const prTime of prTimes) {
				const diffMinutes = prTime.diff(commentTime, "minute", true);
				if (
					diffMinutes > 0 &&
					diffMinutes < CONFIG.COMMENT_BEFORE_PR_VERY_FAST_MINUTES
				) {
					veryFastRepos.add(repo);
				}
			}
		}
	}

	if (veryFastRepos.size >= CONFIG.COMMENT_BEFORE_PR_VERY_FAST_MIN_REPOS) {
		const fastest = findFastestGapSeconds(
			veryFastRepos,
			commentsByRepo,
			prsByRepo,
		);
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
					{ label: "Repos with fast comment→PR", value: veryFastRepos.size, threshold: CONFIG.COMMENT_BEFORE_PR_VERY_FAST_MIN_REPOS },
					{ label: "Shortest gap (s)", value: fastest },
					{ label: "Window (min)", value: CONFIG.COMMENT_BEFORE_PR_VERY_FAST_MINUTES },
				],
				events: fastRepoEvents,
			},
		];
	}

	return [];
}

function findFastestGapSeconds(
	repos: Set<string>,
	commentsByRepo: Map<string, dayjs.Dayjs[]>,
	prsByRepo: Map<string, dayjs.Dayjs[]>,
): number {
	let fastest = Infinity;

	for (const repo of repos) {
		const comments = commentsByRepo.get(repo) ?? [];
		const prs = prsByRepo.get(repo) ?? [];

		for (const comment of comments) {
			for (const pr of prs) {
				const diff = pr.diff(comment, "second", true);
				if (diff > 0 && diff < fastest) fastest = diff;
			}
		}
	}

	return fastest === Infinity ? 0 : Math.round(fastest);
}
