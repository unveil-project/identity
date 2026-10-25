import { CONFIG } from "../config";
import { secondsBetween, toTime } from "../time";
import type { IdentifyEvent, IdentifyFlag } from "../types";
import { nameOf, ownerOf } from "../utils";

export function detectBranchPRAutomation(
	events: IdentifyEvent[],
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
		(e) => e.type === "create" && e.ref?.type === "branch",
	);
	const prEvents = events.filter(
		(e) => e.type === "pull-request" && e.action === "opened",
	);

	const branchTimes = branchCreates
		.map((e) => ({ event: e, time: toTime(e.at) }))
		.sort((a, b) => a.time - b.time);

	const prTimes = prEvents
		.map((e) => ({ event: e, time: toTime(e.at) }))
		.sort((a, b) => a.time - b.time);

	// First check: the branch and the PR are in the same repository, and the account
	// owns it.
	//
	// Only the account's own repos count here. Branching directly inside someone
	// else's repo requires push access that a maintainer had to grant, so those are
	// normal collaborators moving fast. An automation spraying PRs at repos it has
	// no access to has to fork first, and the fork check further down catches that.
	const accountNameLower = accountName.toLowerCase();
	const ownsRepo = (event: IdentifyEvent) =>
		ownerOf(event.repo).toLowerCase() === accountNameLower;

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
				const repoName = prEntry.event.repo;
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
			const matchedBranchEvents: IdentifyEvent[] = [];
			const matchedPREvents: IdentifyEvent[] = [];

			for (const branchEntry of ownedBranchTimes) {
				const repoName = branchEntry.event.repo;
				if (!repoName) {
					continue;
				}

				const repoPrTimes = prTimesByRepo.get(repoName);
				if (!repoPrTimes || repoPrTimes.length === 0) {
					continue;
				}

				if (!prIdxByRepo.has(repoName)) {
					prIdxByRepo.set(repoName, 0);
				}

				let prIdx = prIdxByRepo.get(repoName) ?? 0;

				while (
					prIdx < repoPrTimes.length &&
					repoPrTimes[prIdx].time < branchEntry.time
				) {
					prIdx++;
				}

				if (prIdx < repoPrTimes.length) {
					const timeDiffSeconds = Math.trunc(
						secondsBetween(branchEntry.time, repoPrTimes[prIdx].time),
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
						id: "branch-pr-pattern",
						points: CONFIG.POINTS_BRANCH_PR_AUTOMATION,
						group: "branch-pr",
						amplifiable: true,
						facts: {
							pairs: matchedPairs,
							minPairs: branchPRMinPairs,
							branches: branchCreates.length,
							ownBranches: ownedBranchTimes.length,
							ratio: automationRatio,
							minRatio: branchPRMinRatio,
							maxGapSeconds: maxObservedTimeDiff,
						},
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
		const matchedForkBranchEvents: IdentifyEvent[] = [];
		const matchedForkPREvents: IdentifyEvent[] = [];

		const projectNames = new Set<string>();
		for (const branch of branchTimes) {
			const repo = branch.event.repo;
			if (repo) {
				const projectName = nameOf(repo);
				if (projectName) {
					projectNames.add(projectName);
				}
			}
		}

		for (const projectName of projectNames) {
			const branchesForProject = branchTimes.filter((b) => {
				const repoName = b.event.repo;

				return repoName && nameOf(repoName) === projectName;
			});

			const prsForProject = prTimes.filter((p) => {
				const repoName = p.event.repo;

				return repoName && nameOf(repoName) === projectName;
			});

			if (branchesForProject.length > 0 && prsForProject.length > 0) {
				let prIdx = 0;
				for (const branchEntry of branchesForProject) {
					while (
						prIdx < prsForProject.length &&
						prsForProject[prIdx].time < branchEntry.time
					) {
						prIdx++;
					}

					if (prIdx < prsForProject.length) {
						const timeDiffSeconds = Math.trunc(
							secondsBetween(branchEntry.time, prsForProject[prIdx].time),
						);

						const branchOwner = ownerOf(branchEntry.event.repo);
						const prOwner = ownerOf(prsForProject[prIdx].event.repo);

						if (
							timeDiffSeconds >= 0 &&
							timeDiffSeconds <= CONFIG.BRANCH_PR_TIME_WINDOW_SECONDS &&
							branchOwner !== undefined &&
							branchOwner.toLowerCase() === accountNameLower &&
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
					id: "fork-pr-pattern",
					points: CONFIG.POINTS_BRANCH_PR_AUTOMATION,
					group: "branch-pr",
					amplifiable: true,
					facts: {
						pairs: forkWorkflowMatches,
						minPairs: forkMinPairs,
						branches: branchCreates.length,
						ratio: automationRatio,
						minRatio: branchPRMinRatio,
						maxGapSeconds: forkMaxTimeDiff,
					},
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
