import dayjs from "dayjs";
import { CONFIG } from "../config";
import type { GitHubEvent, IdentifyFlag } from "../types";

export function detectRapidPRSpam(
	events: GitHubEvent[],
	accountAge: number,
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	// Rapid PR spam to repository (fork attack pattern)
	// Detects: multiple PRs opened in rapid succession to same repo
	// Catches spam that doesn't correlate with branch creation
	const isEstablished = accountAge >= CONFIG.AGE_ESTABLISHED_ACCOUNT;
	const minRapidPRs = isEstablished
		? CONFIG.RAPID_PR_SPAM_MIN_PRS_ESTABLISHED
		: CONFIG.RAPID_PR_SPAM_MIN_PRS;

	const prEvents = events.filter(
		(e) => e.type === "PullRequestEvent" && e.payload?.action === "opened",
	);

	if (prEvents.length < minRapidPRs) {
		return flags;
	}

	const prTimes = prEvents
		.map((e) => ({ event: e, time: dayjs(e.created_at) }))
		.sort((a, b) => a.time.valueOf() - b.time.valueOf());

	const prsByRepo = new Map<string, typeof prTimes>();
	for (const prEntry of prTimes) {
		const repoName = prEntry.event.repo?.name;
		if (repoName) {
			if (!prsByRepo.has(repoName)) {
				prsByRepo.set(repoName, []);
			}
			prsByRepo.get(repoName)?.push(prEntry);
		}
	}

	let maxConsecutivePairs = 0;
	let maxConsecutiveTimeDiff = 0;
	let spammyRepo = "";

	for (const [repoName, repoPRs] of prsByRepo.entries()) {
		if (repoPRs.length < minRapidPRs) continue;

		let consecutivePairs = 0;
		let maxTimeDiff = 0;

		for (let i = 0; i < repoPRs.length - 1; i++) {
			const timeDiffSeconds = repoPRs[i + 1].time.diff(
				repoPRs[i].time,
				"second",
			);

			if (timeDiffSeconds <= CONFIG.BRANCH_PR_TIME_WINDOW_SECONDS) {
				consecutivePairs++;
				maxTimeDiff = Math.max(maxTimeDiff, timeDiffSeconds);
			}
		}

		if (consecutivePairs > maxConsecutivePairs) {
			maxConsecutivePairs = consecutivePairs;
			maxConsecutiveTimeDiff = maxTimeDiff;
			spammyRepo = repoName;
		}
	}

	// Compare pairs to PR count - 1 (minRapidPRs represents number of PRs, which is pairs + 1)
	if (maxConsecutivePairs >= minRapidPRs - 1) {
		flags.push({
			label: "Rapid PR spam to repository",
			points: CONFIG.POINTS_RAPID_PR_SPAM,
			amplifiable: true,
			detail: `${maxConsecutivePairs + 1} PRs opened to ${spammyRepo} within ${maxConsecutiveTimeDiff}s intervals`,
		});
	}

	return flags;
}
