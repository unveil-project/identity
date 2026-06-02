import type {
  IdentifyFlag,
  IdentifyOptions,
  IdentifyResult,
  IdentityClassification,
} from "./types";
import { CONFIG } from "./config";
import dayjs from "dayjs";
import minMax from "dayjs/plugin/minMax";
import utc from "dayjs/plugin/utc";

// Import all detector functions
import { detectAccountAge } from "./detectors/account-age";
import { detectZeroReposActivity } from "./detectors/zero-repos";
import { detectRepositoryCreationBurst } from "./detectors/repository-creation";
import { detectInhumanActivityPattern } from "./detectors/activity-pattern";
import { detectNarrowActivityFocus } from "./detectors/event-diversity";
import { detectCommentSpam } from "./detectors/comment-spam";
import { detectBranchPRAutomation } from "./detectors/branch-pr-automation";
import { detectRapidPRSpam } from "./detectors/rapid-pr-spam";
import {
  detectForkActivity,
  detectForkCombinedActivity,
} from "./detectors/fork-activity";
import { detectYoungAccountActivity } from "./detectors/young-account";
import { detectExtremeAndDistributedPRSpam } from "./detectors/pr-spam";

dayjs.extend(minMax);
dayjs.extend(utc);

export function identify({
  createdAt,
  reposCount,
  accountName,
  events,
  excludeRepos = [],
}: IdentifyOptions): IdentifyResult {
  const flags: IdentifyFlag[] = [];

  // Filter out excluded repositories
  const excludeReposLower = excludeRepos.map((r) => r.toLowerCase());
  const filteredEvents = events.filter((e) => {
    const repoName = e.repo?.name?.toLowerCase();
    return repoName && !excludeReposLower.includes(repoName);
  });

  const accountAge = dayjs().diff(createdAt, "days");

  // Helper: calculate foreign events for multiple detectors
  const foreignEvents = filteredEvents.filter((e) => {
    const repoOwner = e.repo?.name?.split("/")[0]?.toLowerCase();
    return repoOwner && repoOwner !== accountName.toLowerCase();
  });

  const isNewOrYoungAccount = accountAge < CONFIG.AGE_YOUNG_ACCOUNT;

  // Run all detectors in sequence
  flags.push(...detectAccountAge(accountAge));
  flags.push(
    ...detectZeroReposActivity(reposCount, foreignEvents, filteredEvents),
  );
  flags.push(...detectRepositoryCreationBurst(filteredEvents));
  flags.push(...detectInhumanActivityPattern(filteredEvents));
  flags.push(...detectNarrowActivityFocus(filteredEvents));
  flags.push(...detectCommentSpam(filteredEvents));
  flags.push(...detectBranchPRAutomation(filteredEvents, accountAge));
  flags.push(...detectRapidPRSpam(filteredEvents, accountAge));
  flags.push(...detectForkActivity(filteredEvents));
  flags.push(...detectForkCombinedActivity(filteredEvents));
  flags.push(
    ...detectYoungAccountActivity(
      filteredEvents,
      events,
      reposCount,
      isNewOrYoungAccount,
      accountName,
    ),
  );
  flags.push(...detectExtremeAndDistributedPRSpam(filteredEvents));

  // Invert score: 100 = human, 0 = bot
  const score = flags.reduce((total, flag) => (total += flag.points), 0);
  const humanScore = Math.max(0, 100 - score);

  // Classification based on inverted score
  let classification: IdentityClassification = "automation";
  if (humanScore >= CONFIG.THRESHOLD_HUMAN) {
    classification = "organic";
  } else if (humanScore >= CONFIG.THRESHOLD_SUSPICIOUS) {
    classification = "mixed";
  }

  return {
    score: humanScore,
    classification,
    flags,
    profile: {
      age: accountAge,
      repos: reposCount,
    },
  };
}
