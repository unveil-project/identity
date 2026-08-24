import dayjs from "dayjs";
import { CONFIG } from "../config";
import type { GitHubEvent, IdentifyFlag } from "../types";

export function detectBranchPRAutomation(
	events: GitHubEvent[],
	isEstablished: boolean,
	accountName: string,
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	// Looks for branches that turn into a pull request almost immediately, again and again.
	// People can be this fast too (branch, push, `gh pr create`), so a match is a hint that
	// something is automated, not proof of it.
	const branchPRMinPairs = isEstablished
		? CONFIG.BRANCH_PR_PATTERN_MIN_PAIRS_ESTABLISHED
		: CONFIG.BRANCH_PR_PATTERN_MIN_PAIRS;
	const branchPRMinRatio = isEstablished
		? CONFIG.BRANCH_PR_PATTERN_RATIO_MIN_ESTABLISHED
		: CONFIG.BRANCH_PR_PATTERN_RATIO_MIN;

	const branchCreates = events.filter(
		(e) => e.type === "CreateEvent" && e.payload?.ref_type === "branch",
	);
	const prEvents = events.filter(
		(e) => e.type === "PullRequestEvent" && e.payload?.action === "opened",
	);

	const branchTimes = branchCreates
		.map((e) => ({ event: e, time: dayjs(e.created_at) }))
		.sort((a, b) => a.time.valueOf() - b.time.valueOf());

	const prTimes = prEvents
		.map((e) => ({ event: e, time: dayjs(e.created_at) }))
		.sort((a, b) => a.time.valueOf() - b.time.valueOf());

	// First check: the branch and the PR are in the same repository, and the account
	// owns it.
	//
	// Only the account's own repos count here. Branching directly inside someone
	// else's repo requires push access that a maintainer had to grant, so those are
	// normal collaborators moving fast. An automation spraying PRs at repos it has
	// no access to has to fork first, and the fork check further down catches that.
	const accountNameLower = accountName.toLowerCase();
	const ownsRepo = (event: GitHubEvent) =>
		event.repo?.name?.split("/")[0]?.toLowerCase() === accountNameLower;

	const ownedBranchTimes = branchTimes.filter((b) => ownsRepo(b.event));
	const ownedPrTimes = prTimes.filter((p) => ownsRepo(p.event));

	if (
		ownedBranchTimes.length >= branchPRMinPairs &&
		ownedPrTimes.length >= branchPRMinPairs
	) {
		const branchPRRatio = ownedBranchTimes.length / ownedPrTimes.length;

		if (branchPRRatio >= CONFIG.BRANCH_PR_COUNT_RATIO_MIN) {
			const prTimesByRepo = new Map<string, typeof prTimes>();
			for (const prEntry of ownedPrTimes) {
				const repoName = prEntry.event.repo?.name;
				if (repoName) {
					if (!prTimesByRepo.has(repoName)) {
						prTimesByRepo.set(repoName, []);
					}
					prTimesByRepo.get(repoName)?.push(prEntry);
				}
			}

			let matchedPairs = 0;
			let maxObservedTimeDiff = 0;
			const prIdxByRepo = new Map<string, number>();
			const matchedBranchEvents: GitHubEvent[] = [];
			const matchedPREvents: GitHubEvent[] = [];

			for (const branchEntry of ownedBranchTimes) {
				const repoName = branchEntry.event.repo?.name;
				if (!repoName) continue;

				const repoPrTimes = prTimesByRepo.get(repoName);
				if (!repoPrTimes || repoPrTimes.length === 0) continue;

				if (!prIdxByRepo.has(repoName)) {
					prIdxByRepo.set(repoName, 0);
				}

				let prIdx = prIdxByRepo.get(repoName) ?? 0;

				while (
					prIdx < repoPrTimes.length &&
					repoPrTimes[prIdx].time.valueOf() < branchEntry.time.valueOf()
				) {
					prIdx++;
				}

				if (prIdx < repoPrTimes.length) {
					const timeDiffSeconds = repoPrTimes[prIdx].time.diff(
						branchEntry.time,
						"second",
					);

					if (
						timeDiffSeconds >= 0 &&
						timeDiffSeconds <= CONFIG.BRANCH_PR_TIME_WINDOW_SECONDS
					) {
						matchedPairs++;
						maxObservedTimeDiff = Math.max(
							maxObservedTimeDiff,
							timeDiffSeconds,
						);
						matchedBranchEvents.push(branchEntry.event);
						matchedPREvents.push(repoPrTimes[prIdx].event);
						prIdx++;
					}
				}

				prIdxByRepo.set(repoName, prIdx);
			}

			if (matchedPairs >= branchPRMinPairs) {
				// The ratio compares matches found in the account's own repos
				// against every branch it created anywhere. That is on purpose:
				// labelling a real person as a bot is costly, and the bigger
				// denominator stops someone who branches all over the place, and
				// happens to be quick in a couple of their own repos, from tripping
				// this flag.
				const automationRatio = matchedPairs / branchCreates.length;

				if (automationRatio >= branchPRMinRatio) {
					flags.push({
						label: "Rapid branch→PR pattern",
						points: CONFIG.POINTS_BRANCH_PR_AUTOMATION,
						group: "branch-pr",
						amplifiable: true,
						detail: `${matchedPairs}/${branchCreates.length} branch creations followed by PRs within ${maxObservedTimeDiff}s, counting only the account's own repositories`,
						data: [
							{
								label: "Matched branch→PR pairs",
								value: matchedPairs,
								threshold: branchPRMinPairs,
							},
							{ label: "Total branches", value: branchCreates.length },
							{
								label: "Branches in own repos",
								value: ownedBranchTimes.length,
							},
							{
								label: "Automation ratio",
								value: `${Math.round(automationRatio * 100)}%`,
								threshold: `${Math.round(branchPRMinRatio * 100)}%`,
							},
							{
								label: "Max time branch→PR (s)",
								value: maxObservedTimeDiff,
								threshold: CONFIG.BRANCH_PR_TIME_WINDOW_SECONDS,
							},
						],
						events: [...matchedBranchEvents, ...matchedPREvents],
						connections: matchedBranchEvents.map((event, i) => ({
							from: event,
							to: matchedPREvents[i],
						})),
					});
					return flags;
				}
			}
		}
	}

	// Second check: the branch is in the user's fork and the PR goes to the original
	// project — same repository name, different owner. Established accounts need fewer
	// matches here, because this pattern is already a much narrower signal.
	const forkMinPairs = isEstablished
		? CONFIG.BRANCH_PR_FORK_MIN_PAIRS_ESTABLISHED
		: CONFIG.BRANCH_PR_PATTERN_MIN_PAIRS;

	if (branchCreates.length >= forkMinPairs && prEvents.length >= forkMinPairs) {
		let forkWorkflowMatches = 0;
		let forkMaxTimeDiff = 0;
		const matchedForkBranchEvents: GitHubEvent[] = [];
		const matchedForkPREvents: GitHubEvent[] = [];

		const projectNames = new Set<string>();
		for (const branch of branchTimes) {
			const repo = branch.event.repo?.name;
			if (repo) {
				const projectName = repo.split("/")[1];
				if (projectName) projectNames.add(projectName);
			}
		}

		for (const projectName of projectNames) {
			const branchesForProject = branchTimes.filter((b) => {
				const repoName = b.event.repo?.name;
				return repoName && repoName.split("/")[1] === projectName;
			});

			const prsForProject = prTimes.filter((p) => {
				const repoName = p.event.repo?.name;
				return repoName && repoName.split("/")[1] === projectName;
			});

			if (branchesForProject.length > 0 && prsForProject.length > 0) {
				let prIdx = 0;
				for (const branchEntry of branchesForProject) {
					while (
						prIdx < prsForProject.length &&
						prsForProject[prIdx].time.valueOf() < branchEntry.time.valueOf()
					) {
						prIdx++;
					}

					if (prIdx < prsForProject.length) {
						const timeDiffSeconds = prsForProject[prIdx].time.diff(
							branchEntry.time,
							"second",
						);

						const branchOwner = branchEntry.event.repo?.name?.split("/")[0];
						const prOwner =
							prsForProject[prIdx].event.repo?.name?.split("/")[0];

						if (
							timeDiffSeconds >= 0 &&
							timeDiffSeconds <= CONFIG.BRANCH_PR_TIME_WINDOW_SECONDS &&
							branchOwner !== undefined &&
							prOwner !== undefined &&
							branchOwner !== prOwner
						) {
							forkWorkflowMatches++;
							forkMaxTimeDiff = Math.max(forkMaxTimeDiff, timeDiffSeconds);
							matchedForkBranchEvents.push(branchEntry.event);
							matchedForkPREvents.push(prsForProject[prIdx].event);
							prIdx++;
						}
					}
				}
			}
		}

		if (forkWorkflowMatches >= forkMinPairs) {
			const automationRatio = forkWorkflowMatches / branchCreates.length;

			if (automationRatio >= branchPRMinRatio) {
				flags.push({
					label: "Rapid fork→PR pattern",
					points: CONFIG.POINTS_BRANCH_PR_AUTOMATION,
					group: "branch-pr",
					amplifiable: true,
					detail: `${forkWorkflowMatches}/${branchCreates.length} fork branches followed by upstream PRs within ${forkMaxTimeDiff}s`,
					data: [
						{
							label: "Matched fork branch→PR pairs",
							value: forkWorkflowMatches,
							threshold: forkMinPairs,
						},
						{ label: "Total branches", value: branchCreates.length },
						{
							label: "Automation ratio",
							value: `${Math.round(automationRatio * 100)}%`,
							threshold: `${Math.round(branchPRMinRatio * 100)}%`,
						},
						{
							label: "Max time branch→PR (s)",
							value: forkMaxTimeDiff,
							threshold: CONFIG.BRANCH_PR_TIME_WINDOW_SECONDS,
						},
					],
					events: [...matchedForkBranchEvents, ...matchedForkPREvents],
					connections: matchedForkBranchEvents.map((event, i) => ({
						from: event,
						to: matchedForkPREvents[i],
					})),
				});
			}
		}
	}

	return flags;
}
