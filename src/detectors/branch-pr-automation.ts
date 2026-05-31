import type { IdentifyFlag, GitHubEvent } from "../types";
import { CONFIG } from "../config";
import dayjs from "dayjs";

export function detectBranchPRAutomation(
  filteredEvents: GitHubEvent[],
  accountAge: number,
): IdentifyFlag[] {
  const flags: IdentifyFlag[] = [];

  // Temporal branch→PR correlation (automated CI/CD workflow detection)
  // Detects pattern: branch created, PR submitted within short window, repeatedly
  // This is a strong automation indicator: real developers don't mechanically repeat this pattern
  // Use stricter thresholds for established accounts to avoid false positives while still catching bot bursts
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
  // Only include explicitly opened PR submission events
  const prEvents = filteredEvents.filter(
    (e) => e.type === "PullRequestEvent" && e.payload?.action === "opened",
  );

  if (
    branchCreates.length >= branchPRMinPairs &&
    prEvents.length >= branchPRMinPairs
  ) {
    // branch/PR ratio must be near 1:1
    const branchPRRatio = branchCreates.length / prEvents.length;

    if (branchPRRatio >= CONFIG.BRANCH_PR_COUNT_RATIO_MIN) {
      // are branches followed by PRs within the window?
      // Create timestamped sorted lists
      const branchTimes = branchCreates
        .map((e) => ({ event: e, time: dayjs(e.created_at) }))
        .sort((a, b) => a.time.valueOf() - b.time.valueOf());

      const prTimes = prEvents
        .map((e) => ({ event: e, time: dayjs(e.created_at) }))
        .sort((a, b) => a.time.valueOf() - b.time.valueOf());

      // Count how many branch creates are followed by a PR within the time window
      let matchedPairs = 0;
      let maxObservedTimeDiff = 0;
      let prIdx = 0;

      for (const branchEntry of branchTimes) {
        // Find the first PR that comes after this branch creation
        while (
          prIdx < prTimes.length &&
          prTimes[prIdx]!.time.valueOf() < branchEntry.time.valueOf()
        ) {
          prIdx++;
        }

        // Check if there's a PR within the time window after this branch
        if (prIdx < prTimes.length) {
          const timeDiffSeconds = prTimes[prIdx]!.time.diff(
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
            prIdx++; // Consume this PR so it matches at most one branch (1:1 pairing)
          }
        }
      }

      // Flag if enough branch→PR pairs follow the automated pattern
      if (matchedPairs >= branchPRMinPairs) {
        const automationRatio = matchedPairs / branchCreates.length;

        // Only flag if most branches have matching PRs (strong automation indicator)
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
