import { CONFIG } from "../config";
import { secondsBetween, toTime } from "../time";
import type { ActivityEvent, Flag } from "../types";

export function detectRapidPRSpam(
	events: ActivityEvent[],
	isEstablished: boolean,
): Flag[] {
	const flags: Flag[] = [];

	// Rapid PRs to repository (fork contribution pattern)
	// Detects: multiple PRs opened in rapid succession to same repo
	// Catches rapid patterns that don't correlate with branch creation
	const minRapidPRs = isEstablished
		? CONFIG.RAPID_PR_SPAM_MIN_PRS_ESTABLISHED
		: CONFIG.RAPID_PR_SPAM_MIN_PRS;

	const prEvents = events.filter(
		(e) => e.type === "pull-request" && e.action === "opened",
	);

	if (prEvents.length < minRapidPRs) {
		return flags;
	}

	const prTimes = prEvents
		.map((e) => ({ event: e, time: toTime(e.at) }))
		.sort((a, b) => a.time - b.time);

	const prsByRepo = new Map<string, typeof prTimes>();
	for (const prEntry of prTimes) {
		const repoName = prEntry.event.repo;
		if (repoName) {
			if (!prsByRepo.has(repoName)) {
				prsByRepo.set(repoName, []);
			}

			prsByRepo.get(repoName)?.push(prEntry);
		}
	}

	let maxConsecutivePairs = 0;
	let maxConsecutiveTimeDiff = 0;
	let targetRepo = "";
	let maxStreakStartIdx = 0;
	let maxStreakEndIdx = 0;

	for (const [repoName, repoPRs] of prsByRepo.entries()) {
		if (repoPRs.length < minRapidPRs) {
			continue;
		}

		let streakStart = 0;
		let streakPairs = 0;
		let streakMaxTimeDiff = 0;

		for (let i = 0; i < repoPRs.length - 1; i++) {
			const currentPR = repoPRs[i];
			const nextPR = repoPRs[i + 1];
			if (!currentPR || !nextPR) {
				continue;
			}

			const timeDiffSeconds = Math.trunc(
				secondsBetween(currentPR.time, nextPR.time),
			);

			if (timeDiffSeconds <= CONFIG.BRANCH_PR_TIME_WINDOW_SECONDS) {
				streakPairs++;
				streakMaxTimeDiff = Math.max(streakMaxTimeDiff, timeDiffSeconds);
			} else {
				streakStart = i + 1;
				streakPairs = 0;
				streakMaxTimeDiff = 0;
			}

			if (streakPairs > maxConsecutivePairs) {
				maxConsecutivePairs = streakPairs;
				maxConsecutiveTimeDiff = streakMaxTimeDiff;
				targetRepo = repoName;
				maxStreakStartIdx = streakStart;
				maxStreakEndIdx = i + 1;
			}
		}
	}

	// Compare pairs to PR count - 1 (minRapidPRs represents number of PRs, which is pairs + 1)
	if (maxConsecutivePairs >= minRapidPRs - 1) {
		const rapidRepoEvents = (prsByRepo.get(targetRepo) ?? [])
			.slice(maxStreakStartIdx, maxStreakEndIdx + 1)
			.map((entry) => entry.event);

		flags.push({
			id: "rapid-prs",
			points: CONFIG.POINTS_RAPID_PR_SPAM,
			group: "branch-pr",
			amplifiable: true,
			facts: {
				prs: maxConsecutivePairs + 1,
				minPRs: minRapidPRs,
				repo: targetRepo,
				maxGapSeconds: maxConsecutiveTimeDiff,
			},
			events: rapidRepoEvents,
		});
	}

	return flags;
}
