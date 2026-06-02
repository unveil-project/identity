import type { IdentifyFlag, GitHubEvent } from "../types";
import { CONFIG } from "../config";
import dayjs from "dayjs";

export function detectBranchPRAutomation(
  filteredEvents: GitHubEvent[],
  accountAge: number,
): IdentifyFlag[] {
  const flags: IdentifyFlag[] = [];

  // Pattern: Temporal branch→PR correlation (automated CI/CD workflow detection)
  // Detects: branch created, PR submitted within short window, repeatedly (repo-scoped)
  // This is a strong automation indicator: real developers don't mechanically repeat this pattern
  const isEstablished = accountAge >= CONFIG.AGE_ESTABLISHED_ACCOUNT;
  const branchPRMinPairs = isEstablished
    ? CONFIG.BRANCH_PR_PATTERN_MIN_PAIRS_ESTABLISHED
    : CONFIG.BRANCH_PR_PATTERN_MIN_PAIRS;
  const branchPRMinRatio = isEstablished
    ? CONFIG.BRANCH_PR_PATTERN_RATIO_MIN_ESTABLISHED
    : CONFIG.BRANCH_PR_PATTERN_RATIO_MIN;

  const branchCreates = filteredEvents.filter(
    (e) => e.type === "CreateEvent" && e.payload?.ref_type === "branch",
  );
  const prEvents = filteredEvents.filter(
    (e) => e.type === "PullRequestEvent" && e.payload?.action === "opened",
  );

  if (
    branchCreates.length >= branchPRMinPairs &&
    prEvents.length >= branchPRMinPairs
  ) {
    const branchPRRatio = branchCreates.length / prEvents.length;

    if (branchPRRatio >= CONFIG.BRANCH_PR_COUNT_RATIO_MIN) {
      const branchTimes = branchCreates
        .map((e) => ({ event: e, time: dayjs(e.created_at) }))
        .sort((a, b) => a.time.valueOf() - b.time.valueOf());

      const prTimes = prEvents
        .map((e) => ({ event: e, time: dayjs(e.created_at) }))
        .sort((a, b) => a.time.valueOf() - b.time.valueOf());

      // Group PRs by repository for repo-scoped matching
      const prTimesByRepo = new Map<string, typeof prTimes>();
      for (const prEntry of prTimes) {
        const repoName = prEntry.event.repo?.name;
        if (repoName) {
          if (!prTimesByRepo.has(repoName)) {
            prTimesByRepo.set(repoName, []);
          }
          prTimesByRepo.get(repoName)!.push(prEntry);
        }
      }

      let matchedPairs = 0;
      let maxObservedTimeDiff = 0;
      const prIdxByRepo = new Map<string, number>();

      for (const branchEntry of branchTimes) {
        const repoName = branchEntry.event.repo?.name;
        if (!repoName) continue;

        const repoPrTimes = prTimesByRepo.get(repoName);
        if (!repoPrTimes || repoPrTimes.length === 0) continue;

        if (!prIdxByRepo.has(repoName)) {
          prIdxByRepo.set(repoName, 0);
        }
        let prIdx = prIdxByRepo.get(repoName)!;

        while (
          prIdx < repoPrTimes.length &&
          repoPrTimes[prIdx]!.time.valueOf() < branchEntry.time.valueOf()
        ) {
          prIdx++;
        }

        if (prIdx < repoPrTimes.length) {
          const timeDiffSeconds = repoPrTimes[prIdx]!.time.diff(
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
            prIdx++;
          }
        }

        prIdxByRepo.set(repoName, prIdx);
      }

      if (matchedPairs >= branchPRMinPairs) {
        const automationRatio = matchedPairs / branchCreates.length;

        if (automationRatio >= branchPRMinRatio) {
          flags.push({
            label: "Automated branch/PR workflow",
            points: CONFIG.POINTS_BRANCH_PR_AUTOMATION,
            detail: `${matchedPairs}/${branchCreates.length} branch creations followed by PRs within ${maxObservedTimeDiff}s`,
          });
        }
      }
    }
  }

  return flags;
}
