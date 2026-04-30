import type {
  IdentifyFlag,
  IdentifyOptions,
  IdentifyResult,
  IdentityClassification,
} from "./types";
import { calculateNormalizedShannonsEntropy } from "./utils";
import { CONFIG } from "./config";
import dayjs from "dayjs";
import minMax from "dayjs/plugin/minMax";
import utc from "dayjs/plugin/utc";

dayjs.extend(minMax);
dayjs.extend(utc);

export function identify({
  createdAt,
  reposCount,
  accountName,
  events,
}: IdentifyOptions): IdentifyResult {
  const flags: IdentifyFlag[] = [];

  const accountAge = dayjs().diff(createdAt, "days");

  if (accountAge < CONFIG.AGE_NEW_ACCOUNT) {
    flags.push({
      label: "Recently created",
      points: CONFIG.POINTS_NEW_ACCOUNT,
      detail: `Account is ${accountAge} days old`,
    });
  } else if (accountAge < CONFIG.AGE_YOUNG_ACCOUNT) {
    flags.push({
      label: "Young account",
      points: CONFIG.POINTS_YOUNG_ACCOUNT,
      detail: `Account is ${accountAge} days old`,
    });
  }

  const foreignEvents = events.filter((e) => {
    const repoOwner = e.repo?.name?.split("/")[0]?.toLowerCase();
    return repoOwner && repoOwner !== accountName.toLowerCase();
  });

  const hasAllExternal = reposCount === 0 && foreignEvents.length === events.length;

  if (hasAllExternal && events.length >= CONFIG.ZERO_REPOS_MIN_EVENTS) {
    flags.push({
      label: "Only active on other people's repos",
      points: CONFIG.POINTS_ZERO_REPOS_ACTIVE + CONFIG.POINTS_NO_PERSONAL_ACTIVITY,
      detail: `No personal repos, all ${events.length} events are on repos they don't own`,
    });
  }

  const isNewOrYoungAccount = accountAge < CONFIG.AGE_YOUNG_ACCOUNT;

  // Behavioral pattern checks (apply to all accounts regardless of age)
  if (events.length >= CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
    // Filter CreateEvent to only actual repository creations (not branch/tag creation)
    const createEvents = events.filter((e) => {
      return e.type === "CreateEvent" && e.payload?.ref_type === "repository";
    });

    // Rapid repo creation burst (real repository creation clustering)
    if (createEvents.length >= CONFIG.CREATE_EVENTS_MIN) {
      const createTimestamps = createEvents
        .map((e) => dayjs(e.created_at))
        .sort((a, b) => a.valueOf() - b.valueOf());

      // Check for repo creation clustering (multiple repos in short time window)
      let maxCreatesInWindow = 0;
      let windowStartIdx = 0;

      for (let endIdx = 0; endIdx < createTimestamps.length; endIdx++) {
        const windowEnd = createTimestamps[endIdx];

        // Slide window to include only events within 24 hours
        while (windowEnd && windowEnd.diff(createTimestamps[windowStartIdx], "hour", true) > 24) {
          windowStartIdx++;
        }

        const createsInWindow = endIdx - windowStartIdx + 1;
        maxCreatesInWindow = Math.max(maxCreatesInWindow, createsInWindow);
      }

      if (maxCreatesInWindow >= CONFIG.CREATE_BURST_EXTREME) {
        flags.push({
          label: "Concentrated repository creation",
          points: CONFIG.POINTS_CREATE_BURST_EXTREME,
          detail: `${maxCreatesInWindow} repositories created in a short timeframe (within 24 hours)`,
        });
      } else if (maxCreatesInWindow >= CONFIG.CREATE_BURST_HIGH) {
        flags.push({
          label: "Frequent repository creation",
          points: CONFIG.POINTS_CREATE_BURST_HIGH,
          detail: `${maxCreatesInWindow} repositories created in a short timeframe (within 24 hours)`,
        });
      }
    }

    // 24/7 activity pattern detection - ONLY PER-DAY ANALYSIS
    // Global hours across multiple days is meaningless - someone codes at different times on different days
    // Only flag if a SINGLE DAY shows no realistic sleep window (< 3 hours gap)
    const eventsByDay = new Map<string, Set<number>>();
    events.forEach((e) => {
      const day = dayjs.utc(e.created_at).format("YYYY-MM-DD");
      const hour = dayjs.utc(e.created_at).hour();
      if (!eventsByDay.has(day)) {
        eventsByDay.set(day, new Set());
      }
      eventsByDay.get(day)!.add(hour);
    });

    // Find the day with the most suspicious 24/7 pattern
    type DaySuspiciousPattern = {
      day: string;
      hoursActive: number;
      restGap: number;
      eventCount: number;
    };
    let dayWithMostSuspiciousPattern: DaySuspiciousPattern | null = null;
    let minRestWindowFound = 24;

    eventsByDay.forEach((hoursInDay, day) => {
      const hoursActive = hoursInDay.size;
      const eventsOnDay = events.filter(
        (e) => dayjs.utc(e.created_at).format("YYYY-MM-DD") === day,
      ).length;

      // Only check days with significant activity
      if (hoursActive >= CONFIG.HOURS_ACTIVE_EXTREME && eventsOnDay >= 10) {
        const avgEventsPerHour = eventsOnDay / hoursActive;
        const meetsEventThreshold = avgEventsPerHour >= CONFIG.EVENTS_PER_HOUR_MIN;

        // Only consider days that meet event density requirement
        if (meetsEventThreshold) {
          const sortedHours = Array.from(hoursInDay).sort((a, b) => a - b);

          // Find the largest rest window (sleep gap) in this specific day
          const firstHour = sortedHours[0]!;
          const lastHour = sortedHours[sortedHours.length - 1]!;
          let maxRestThisDay = 24 - lastHour + firstHour - 1; // wrap-around gap, consistent -1 with intra-day logic

          for (let i = 0; i < sortedHours.length - 1; i++) {
            const gap = sortedHours[i + 1]! - sortedHours[i]! - 1;
            maxRestThisDay = Math.max(maxRestThisDay, gap);
          }

          // Track the day with smallest rest window (most suspicious)
          if (maxRestThisDay < minRestWindowFound) {
            minRestWindowFound = maxRestThisDay;
            dayWithMostSuspiciousPattern = {
              day,
              hoursActive,
              restGap: maxRestThisDay,
              eventCount: eventsOnDay,
            } as DaySuspiciousPattern;
          }
        }
      }
    });

    // Only flag if found a day with unrealistic sleep (< 3 hours = no real sleep possible)
    if (dayWithMostSuspiciousPattern) {
      const pattern: DaySuspiciousPattern = dayWithMostSuspiciousPattern;
      if (minRestWindowFound < 3) {
        let points: number = CONFIG.POINTS_24_7_ACTIVITY;
        if (minRestWindowFound < 1) {
          points = Math.round(points * 1.5);
        }

        flags.push({
          label: "24/7 activity pattern",
          points,
          detail: `${pattern.day}: active across ${pattern.hoursActive} hours with only ${minRestWindowFound} hour${minRestWindowFound === 1 ? "" : "s"} rest`,
        });
      }
    }
    // Event type diversity check using Shannon's entropy
    // Bots typically have narrow event type profiles (low entropy)
    // Humans engage in varied activities (high entropy)
    const eventTypeMap = new Map<string, number>();
    events.forEach((e) => {
      if (e.type) {
        eventTypeMap.set(e.type, (eventTypeMap.get(e.type) || 0) + 1);
      }
    });

    const eventTypeCount = Array.from(eventTypeMap.values());
    const eventTypeEntropy = calculateNormalizedShannonsEntropy(eventTypeCount);

    const eventTypes = new Set(
      events.map((e) => e.type).filter((t): t is string => t !== null && t !== undefined),
    );
    const hasInteraction =
      eventTypes.has("IssueCommentEvent") ||
      eventTypes.has("PullRequestReviewEvent") ||
      eventTypes.has("PullRequestReviewCommentEvent");
    const hasWatches = eventTypes.has("WatchEvent");

    // Pure automation indicator:
    // Very narrow type profile (few types + low variety) + no human interactions
    // OR: HIGH event type entropy (many types with equal distribution - automated cycling)
    const narrowTypeProfile = eventTypes.size <= 3 && eventTypeEntropy < 0.8;
    const automatedCycling = eventTypeEntropy > 0.85 && eventTypes.size >= 5;

    if ((narrowTypeProfile || automatedCycling) && !hasInteraction && !hasWatches) {
      flags.push({
        label: "Narrow activity focus",
        points: CONFIG.POINTS_LOW_DIVERSITY,
        detail: `${eventTypes.size} event types (entropy: ${eventTypeEntropy.toFixed(2)}) without interpersonal interactions`,
      });
    }

    // Issue comment spam detection (multiple comments across different repos in short time)
    const issueCommentEvents = events.filter((e) => e.type === "IssueCommentEvent");

    if (issueCommentEvents.length >= CONFIG.ISSUE_COMMENT_MIN_FOR_SPRAY) {
      // Sort by timestamp
      const commentTimestamps = issueCommentEvents
        .map((e) => ({ event: e, time: dayjs(e.created_at) }))
        .sort((a, b) => a.time.valueOf() - b.time.valueOf());

      // Find the densest window of activity
      let maxDistinctReposInWindow = 0;
      let maxReposWindowStartIdx = 0;
      let maxReposWindowEndIdx = 0;
      let windowStartIdx = 0;
      const windowMinutes = CONFIG.ISSUE_COMMENT_SPAM_WINDOW_MINUTES;

      for (let windowEndIdx = 0; windowEndIdx < commentTimestamps.length; windowEndIdx++) {
        const windowEnd = commentTimestamps[windowEndIdx]?.time;

        // Slide window start forward until within the time window
        while (
          commentTimestamps[windowStartIdx] &&
          windowEnd &&
          windowEnd.diff(commentTimestamps[windowStartIdx]!.time, "minute", true) > windowMinutes
        ) {
          windowStartIdx++;
        }

        // Count distinct repos in this time window
        const reposInWindow = new Set(
          commentTimestamps
            .slice(windowStartIdx, windowEndIdx + 1)
            .map((item) => item.event.repo?.name)
            .filter((name): name is string => name !== undefined),
        );

        if (reposInWindow.size > maxDistinctReposInWindow) {
          maxDistinctReposInWindow = reposInWindow.size;
          maxReposWindowStartIdx = windowStartIdx;
          maxReposWindowEndIdx = windowEndIdx;
        }
      }

      // Flag if comments are being sprayed across many repos
      if (maxDistinctReposInWindow >= CONFIG.ISSUE_COMMENT_SPRAY_EXTREME) {
        const windowStart = commentTimestamps[maxReposWindowStartIdx]?.time;
        const windowEnd = commentTimestamps[maxReposWindowEndIdx]?.time;
        const commentsInWindow = maxReposWindowEndIdx - maxReposWindowStartIdx + 1;
        const timeSpanMinutes =
          windowEnd && windowStart
            ? Math.round(windowEnd.diff(windowStart, "minute", true))
            : 0;
        flags.push({
          label: "Issue comment spam",
          points: CONFIG.POINTS_ISSUE_COMMENT_SPRAY_EXTREME,
          detail: `${commentsInWindow} comments to ${maxDistinctReposInWindow} different repos in just ${timeSpanMinutes} minute${timeSpanMinutes === 1 ? "" : "s"}`,
        });
      } else if (maxDistinctReposInWindow >= CONFIG.ISSUE_COMMENT_SPRAY_HIGH) {
        const windowStart = commentTimestamps[maxReposWindowStartIdx]?.time;
        const windowEnd = commentTimestamps[maxReposWindowEndIdx]?.time;
        const commentsInWindow = maxReposWindowEndIdx - maxReposWindowStartIdx + 1;
        const timeSpanMinutes =
          windowEnd && windowStart
            ? Math.round(windowEnd.diff(windowStart, "minute", true))
            : 0;
        flags.push({
          label: "High comment frequency across repos",
          points: CONFIG.POINTS_ISSUE_COMMENT_SPRAY_HIGH,
          detail: `${commentsInWindow} comments to ${maxDistinctReposInWindow} different repos in just ${timeSpanMinutes} minute${timeSpanMinutes === 1 ? "" : "s"}`,
        });
      }
    }

    // PR comment spam detection (multiple review comments across different PRs/repos in short time)
    const prCommentEvents = events.filter((e) => e.type === "PullRequestReviewCommentEvent");

    if (prCommentEvents.length >= CONFIG.PR_COMMENT_MIN_FOR_SPRAY) {
      // Sort by timestamp
      const prCommentTimestamps = prCommentEvents
        .map((e) => ({ event: e, time: dayjs(e.created_at) }))
        .sort((a, b) => a.time.valueOf() - b.time.valueOf());

      // Find the densest window of PR comment activity
      let maxDistinctPRsInWindow = 0;
      let maxPRsWindowStartIdx = 0;
      let maxPRsWindowEndIdx = 0;
      let windowStartIdx = 0;
      const windowMinutes = CONFIG.PR_COMMENT_SPAM_WINDOW_MINUTES;

      for (let windowEndIdx = 0; windowEndIdx < prCommentTimestamps.length; windowEndIdx++) {
        const windowEnd = prCommentTimestamps[windowEndIdx]?.time;

        // Slide window start forward until within the time window
        while (
          prCommentTimestamps[windowStartIdx] &&
          windowEnd &&
          windowEnd.diff(prCommentTimestamps[windowStartIdx]!.time, "minute", true) > windowMinutes
        ) {
          windowStartIdx++;
        }

        // Count distinct PRs (identified by repo + pull request number combination)
        const prsInWindow = new Set(
          prCommentTimestamps
            .slice(windowStartIdx, windowEndIdx + 1)
            .map((item) => {
              const repoName = item.event.repo?.name;
              // Extract PR number from payload (PullRequestReviewCommentEvent)
              const prNumber =
                (item.event.payload as any)?.pull_request?.number ||
                (item.event.payload as any)?.number ||
                (item.event as any)?.issue?.number;
              
              // Return repo#prNumber if available, otherwise just repo name
              if (repoName && prNumber) {
                return `${repoName}#${prNumber}`;
              }
              return repoName;
            })
            .filter((key): key is string => key !== undefined),
        );

        if (prsInWindow.size > maxDistinctPRsInWindow) {
          maxDistinctPRsInWindow = prsInWindow.size;
          maxPRsWindowStartIdx = windowStartIdx;
          maxPRsWindowEndIdx = windowEndIdx;
        }
      }

      // Flag if comments are being sprayed across many PRs
      if (maxDistinctPRsInWindow >= CONFIG.PR_COMMENT_SPRAY_EXTREME) {
        const windowStart = prCommentTimestamps[maxPRsWindowStartIdx]?.time;
        const windowEnd = prCommentTimestamps[maxPRsWindowEndIdx]?.time;
        const commentsInWindow = maxPRsWindowEndIdx - maxPRsWindowStartIdx + 1;
        const timeSpanMinutes =
          windowEnd && windowStart
            ? Math.round(windowEnd.diff(windowStart, "minute", true))
            : 0;
        flags.push({
          label: "PR comment spam",
          points: CONFIG.POINTS_PR_COMMENT_SPRAY_EXTREME,
          detail: `${commentsInWindow} comments on ${maxDistinctPRsInWindow} different PRs in just ${timeSpanMinutes} minute${timeSpanMinutes === 1 ? "" : "s"}`,
        });
      } else if (maxDistinctPRsInWindow >= CONFIG.PR_COMMENT_SPRAY_HIGH) {
        const windowStart = prCommentTimestamps[maxPRsWindowStartIdx]?.time;
        const windowEnd = prCommentTimestamps[maxPRsWindowEndIdx]?.time;
        const commentsInWindow = maxPRsWindowEndIdx - maxPRsWindowStartIdx + 1;
        const timeSpanMinutes =
          windowEnd && windowStart
            ? Math.round(windowEnd.diff(windowStart, "minute", true))
            : 0;
        flags.push({
          label: "High PR comment frequency",
          points: CONFIG.POINTS_PR_COMMENT_SPRAY_HIGH,
          detail: `${commentsInWindow} comments on ${maxDistinctPRsInWindow} different PRs in just ${timeSpanMinutes} minute${timeSpanMinutes === 1 ? "" : "s"}`,
        });
      }
    }
  }

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

  const branchCreates = events.filter(
    (e) => e.type === "CreateEvent" && e.payload?.ref_type === "branch",
  );
  // Only include explicitly opened PR submission events
  const prEvents = events.filter(
    (e) => e.type === "PullRequestEvent" && e.payload?.action === "opened",
  );

  if (branchCreates.length >= branchPRMinPairs && prEvents.length >= branchPRMinPairs) {
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
          const timeDiffSeconds = prTimes[prIdx]!.time.diff(branchEntry.time, "second");

          if (timeDiffSeconds >= 0 && timeDiffSeconds <= CONFIG.BRANCH_PR_TIME_WINDOW_SECONDS) {
            matchedPairs++;
            maxObservedTimeDiff = Math.max(maxObservedTimeDiff, timeDiffSeconds);
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

  // Fork surge - applies uniformly to all accounts (detects time-based spike in forking)
  // Spam is spam: 8+ forks in 24 hours is bot behavior regardless of account age
  const forkEvents = events.filter((e) => e.type === "ForkEvent");

  if (forkEvents.length >= CONFIG.FORKS_HIGH) {
    // Detect if forks are clustered in time (spike) vs spread over time
    const forkTimestamps = forkEvents
      .map((e) => dayjs(e.created_at))
      .sort((a, b) => a.valueOf() - b.valueOf());

    // Helper to find max forks in any window of given hours
    const findMaxForksInWindow = (hours: number): number => {
      let maxForks = 0;
      let windowStartIdx = 0;

      for (let windowEndIdx = 0; windowEndIdx < forkTimestamps.length; windowEndIdx++) {
        const windowEnd = forkTimestamps[windowEndIdx];

        while (
          windowEnd &&
          windowEnd.diff(forkTimestamps[windowStartIdx], "hour", true) > hours
        ) {
          windowStartIdx++;
        }

        const forksInWindow = windowEndIdx - windowStartIdx + 1;
        maxForks = Math.max(maxForks, forksInWindow);
      }

      return maxForks;
    };

    // Calculate all time windows at once
    const maxForksIn24h = findMaxForksInWindow(24);
    const maxForksIn48h = findMaxForksInWindow(48);
    const maxForksIn72h = findMaxForksInWindow(72);

    // Determine which time window to flag (only flag the MOST SEVERE, not all)
    // This avoids redundant overlapping alerts
    let forkSpikeFlag: IdentifyFlag | null = null;

    // Check 72-hour window first (largest)
    if (maxForksIn72h >= CONFIG.FORKS_SURGE_72H) {
      forkSpikeFlag = {
        label: "Severe multi-day fork surge",
        points: CONFIG.POINTS_FORK_SURGE_72H,
        detail: `Rapid burst: ${maxForksIn72h} repositories forked over 72 hours`,
      };
    }
    // Fall back to 48-hour if it's high but 72h isn't extreme
    else if (maxForksIn48h >= CONFIG.FORKS_SURGE_48H) {
      forkSpikeFlag = {
        label: "Multi-day fork surge",
        points: CONFIG.POINTS_FORK_SURGE_48H,
        detail: `Concentrated burst: ${maxForksIn48h} repositories forked over 2 days`,
      };
    }
    // Finally check 24-hour window
    else if (maxForksIn24h >= CONFIG.FORKS_SURGE_EXTREME_HIGH) {
      forkSpikeFlag = {
        label: "Extreme fork automation",
        points: CONFIG.POINTS_FORK_SURGE_EXTREME_HIGH,
        detail: `${maxForksIn24h} repositories forked in a single day`,
      };
    } else if (maxForksIn24h >= CONFIG.FORKS_SURGE_SEVERE) {
      forkSpikeFlag = {
        label: "Severe fork surge",
        points: CONFIG.POINTS_FORK_SURGE_SEVERE,
        detail: `${maxForksIn24h} repositories forked in a single day`,
      };
    } else if (maxForksIn24h >= CONFIG.FORKS_EXTREME) {
      forkSpikeFlag = {
        label: "Many recent forks",
        points: CONFIG.POINTS_FORK_SURGE,
        detail: `${maxForksIn24h} repositories forked in a single day`,
      };
    } else if (maxForksIn24h >= CONFIG.FORKS_HIGH) {
      forkSpikeFlag = {
        label: "Multiple forks",
        points: CONFIG.POINTS_MULTIPLE_FORKS,
        detail: `${maxForksIn24h} repositories forked in a single day`,
      };
    }

    // Add the single most severe spike flag
    if (forkSpikeFlag) {
      flags.push(forkSpikeFlag);
    }

    // Fork rate metric (forks per day over activity period)
    // Only applies if we haven't already detected a severe concentrated burst
    const hasSevereBurst = maxForksIn24h >= CONFIG.FORKS_SURGE_SEVERE || maxForksIn48h >= CONFIG.FORKS_SURGE_48H;

    if (forkTimestamps.length > 0 && !hasSevereBurst) {
      const oldestFork = forkTimestamps[0];
      const newestFork = forkTimestamps[forkTimestamps.length - 1];

      if (oldestFork && newestFork) {
        const forkSpanDays = Math.max(1, newestFork.diff(oldestFork, "day"));
        const forksPerDay = forkEvents.length / forkSpanDays;

        if (forksPerDay >= CONFIG.FORKS_PER_DAY_HIGH) {
          flags.push({
            label: "High sustained fork rate",
            points: CONFIG.POINTS_FORKS_PER_DAY_HIGH,
            detail: `${forkEvents.length} repositories forked over ${forkSpanDays} day${forkSpanDays > 1 ? "s" : ""} (sustained high activity)`,
          });
        }
      }
    }

    // Consecutive days of forking - only flag if it's a distributed pattern
    // Not a single concentrated burst (which is already flagged above)
    const forkDays = new Set<string>();
    forkEvents.forEach((e) => {
      forkDays.add(dayjs.utc(e.created_at).format("YYYY-MM-DD"));
    });

    if (forkDays.size >= CONFIG.CONSECUTIVE_FORK_DAYS && !hasSevereBurst) {
      const sortedForkDays = Array.from(forkDays)
        .map((d) => dayjs(d, "YYYY-MM-DD"))
        .sort((a, b) => a.valueOf() - b.valueOf());

      let maxConsecutiveForkDays = 1;
      let currentStreak = 1;

      for (let i = 1; i < sortedForkDays.length; i++) {
        const prev = sortedForkDays[i - 1];
        const curr = sortedForkDays[i];

        if (curr && prev && curr.diff(prev, "day") === 1) {
          currentStreak++;
          maxConsecutiveForkDays = Math.max(maxConsecutiveForkDays, currentStreak);
        } else {
          currentStreak = 1;
        }
      }

      if (maxConsecutiveForkDays >= CONFIG.CONSECUTIVE_FORK_DAYS) {
        const totalDays = forkDays.size;
        flags.push({
          label: "Extended forking pattern",
          points: CONFIG.POINTS_CONSECUTIVE_FORK_DAYS,
          detail: `Forking activity on ${totalDays} days (${maxConsecutiveForkDays} consecutive), ${forkEvents.length} repositories total`,
        });
      }
    }

    // Fork repository diversity (spreading across many different repos)
    const forkedRepos = new Set<string>(
      forkEvents
        .map((e) => e.repo?.name)
        .filter((name): name is string => name !== undefined),
    );

    if (forkedRepos.size >= CONFIG.FORK_REPO_DIVERSITY_HIGH) {
      flags.push({
        label: "Widespread fork targets",
        points: CONFIG.POINTS_FORK_DIVERSITY,
        detail: `Targeting many different repositories: ${forkEvents.length} forks across ${forkedRepos.size} different repos`,
      });
    }

    // Fork + coordinated activity combo (forks + branches + PRs = coordinated automation)
    if (
      forkEvents.length >= CONFIG.FORK_COMBINED_ACTIVITY_MIN &&
      events.length >= CONFIG.MIN_EVENTS_FOR_ANALYSIS
    ) {
      const branchCreateEvents = events.filter(
        (e) => e.type === "CreateEvent" && e.payload?.ref_type === "branch",
      );
      const allPREvents = events.filter((e) => e.type === "PullRequestEvent");

      if (
        branchCreateEvents.length >= CONFIG.FORK_COMBINED_BRANCHES &&
        allPREvents.length >= CONFIG.FORK_COMBINED_PRS
      ) {
        flags.push({
          label: "Coordinated fork/branch/PR automation",
          points: CONFIG.POINTS_FORK_COMBINED_ACTIVITY,
          detail: `Combination of fork, branch, and PR activities: ${forkEvents.length} forks + ${branchCreateEvents.length} branches + ${allPREvents.length} PRs`,
        });
      }
    }
  }

  // Additional checks for young accounts (more strict thresholds)
  if (isNewOrYoungAccount && events.length >= CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
    const userLogin = accountName.toLowerCase();

    const commitEvents = events.filter((e) => e.type === "PushEvent");

    if (commitEvents.length >= CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
      const timestamps = commitEvents
        .map((e) => dayjs(e.created_at))
        .sort((a, b) => a.valueOf() - b.valueOf());

      // Analyze event temporal distribution - detect burst patterns
      let maxCommitsInHour = 0;
      let windowStartIndex = 0;

      for (let windowEndIndex = 0; windowEndIndex < timestamps.length; windowEndIndex++) {
        const windowEnd = timestamps[windowEndIndex];

        // Slide window start forward until within 1 hour
        while (windowEnd && windowEnd.diff(timestamps[windowStartIndex], "hour", true) > 1) {
          windowStartIndex++;
        }

        const commitsInWindow = windowEndIndex - windowStartIndex + 1;
        maxCommitsInHour = Math.max(maxCommitsInHour, commitsInWindow);
      }

      // Extreme burst (regardless of distribution)
      if (maxCommitsInHour >= CONFIG.HOURLY_ACTIVITY_EXTREME) {
        flags.push({
          label: "Extreme commit burst",
          points: CONFIG.POINTS_EXTREME_ACTIVITY_DENSITY,
          detail: `${maxCommitsInHour} commits within 1 hour`,
        });
      } else if (maxCommitsInHour >= CONFIG.HOURLY_ACTIVITY_HIGH) {
        flags.push({
          label: "High commit burst",
          points: CONFIG.POINTS_HIGH_ACTIVITY_DENSITY,
          detail: `${maxCommitsInHour} commits within 1 hour`,
        });
      }

      // Detect ultra-tight bursts (e.g., 3+ commits within 10 seconds)
      let tightBurstCount = 0;

      for (let i = 1; i < timestamps.length; i++) {
        if (timestamps[i] !== undefined && timestamps[i - 1] !== undefined) {
          const diffSeconds = timestamps[i]!.diff(timestamps[i - 1]!, "second");

          if (diffSeconds <= CONFIG.TIGHT_COMMIT_SECONDS) {
            tightBurstCount++;
          }
        }
      }

      if (tightBurstCount >= CONFIG.TIGHT_COMMIT_THRESHOLD) {
        flags.push({
          label: "High commit frequency",
          points: CONFIG.POINTS_TIGHT_BURST,
          detail: `${tightBurstCount + 1} commits within very short intervals`,
        });
      }
    }

    // PRs (flag more aggressively)
    const prEvents = events.filter((e) => e.type === "PullRequestEvent");

    if (prEvents.length >= CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
      const timestamps = prEvents.map((e) => dayjs(e.created_at));
      const oldestEvent = dayjs.min(timestamps);
      const newestEvent = dayjs.max(timestamps);

      if (newestEvent) {
        const eventSpanDays = Math.max(1, newestEvent.diff(oldestEvent, "day"));
        const prsPerDay = prEvents.length / eventSpanDays;

        if (prsPerDay >= CONFIG.ACTIVITY_DENSITY_EXTREME / 2) {
          // PRs are much rarer
          flags.push({
            label: "Very high PR volume",
            points: CONFIG.POINTS_EXTREME_ACTIVITY_DENSITY + 10,
            detail: `${prEvents.length} PRs in ${eventSpanDays} day${eventSpanDays === 1 ? "" : "s"}`,
          });
        } else if (prsPerDay >= CONFIG.ACTIVITY_DENSITY_HIGH / 2) {
          flags.push({
            label: "High PR volume",
            points: CONFIG.POINTS_HIGH_ACTIVITY_DENSITY + 5,
            detail: `${prEvents.length} PRs in ${eventSpanDays} day${eventSpanDays === 1 ? "" : "s"}`,
          });
        }
      }
    }

    const codingEventTypes = new Set(["PushEvent", "PullRequestEvent"]);
    const codingEventsWithReviews = events.filter(
      (e) =>
        (e.type && codingEventTypes.has(e.type)) ||
        e.type === "PullRequestReviewEvent" ||
        e.type === "PullRequestReviewCommentEvent",
    );

    // Inhuman daily coding activity detection using Shannon's entropy
    // Bots: uniform hour distribution (high entropy) across many hours = suspicious
    // Humans: concentrated in certain hours (low entropy/predictable patterns)
    const codingEventsByDay = new Map<string, Date[]>();
    codingEventsWithReviews.forEach((e) => {
      if (!e.created_at) {
        return;
      }

      const t = new Date(e.created_at);
      const day = t.toISOString().slice(0, 10);
      if (!codingEventsByDay.has(day)) codingEventsByDay.set(day, []);
      codingEventsByDay.get(day)!.push(t);
    });

    // For each day, analyze hour distribution using entropy
    // Very high entropy (uniform spread) across many hours = suspicious bot behavior
    const daysWithUniformDistribution: string[] = [];
    codingEventsByDay.forEach((dayTimestamps, day) => {
      const hourMap = new Map<number, number>();
      dayTimestamps.forEach((t) => {
        const hour = t.getUTCHours();
        hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
      });

      const uniqueHours = hourMap.size;
      const hourEntropy = calculateNormalizedShannonsEntropy(Array.from(hourMap.values()));

      // Only flag days with many hours AND uniform distribution (bot-like)
      if (uniqueHours >= CONFIG.HOURS_PER_DAY_INHUMAN && hourEntropy > 0.8) {
        daysWithUniformDistribution.push(day);
      }
    });

    // Check if these inhuman days are consecutive (require both many hours AND high entropy)
    if (daysWithUniformDistribution.length >= CONFIG.CONSECUTIVE_INHUMAN_DAYS_EXTREME) {
      daysWithUniformDistribution.sort();
      let consecutiveCount = 1;
      let maxConsecutive = 1;
      for (let i = 1; i < daysWithUniformDistribution.length; i++) {
        const prev = dayjs(daysWithUniformDistribution[i - 1]);
        const curr = dayjs(daysWithUniformDistribution[i]);
        const diffDays = curr.diff(prev, "day");

        if (diffDays === 1) {
          consecutiveCount++;
          maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
        } else {
          consecutiveCount = 1;
        }
      }

      // Consecutive marathon days = definitely not human or really needs to touch grass
      if (maxConsecutive >= CONFIG.CONSECUTIVE_INHUMAN_DAYS_EXTREME) {
        flags.push({
          label: "Extended daily coding",
          points: CONFIG.POINTS_NONSTOP_ACTIVITY,
          detail: `${maxConsecutive} days in a row with ${CONFIG.HOURS_PER_DAY_INHUMAN}+ hours of coding`,
        });
      } else if (daysWithUniformDistribution.length >= CONFIG.FREQUENT_MARATHON_DAYS) {
        flags.push({
          label: "Frequent long coding days",
          points: CONFIG.POINTS_FREQUENT_MARATHON,
          detail: `${daysWithUniformDistribution.length} days with ${CONFIG.HOURS_PER_DAY_INHUMAN}+ hours of coding and uniform hourly distribution`,
        });
      }
    }

    // Consecutive days activity
    // working non-stop
    const daySet = new Set<string>();
    events.forEach((e) => {
      daySet.add(dayjs.utc(e.created_at).format("YYYY-MM-DD"));
    });

    const sortedDays = Array.from(daySet)
      .map((d) => dayjs(d, "YYYY-MM-DD"))
      .sort((a, b) => a.valueOf() - b.valueOf());

    let maxStreak = 1;
    let currentStreak = 1;

    for (let i = 1; i < sortedDays.length; i++) {
      const prev = sortedDays[i - 1];
      const curr = sortedDays[i];

      if (curr && prev && curr.diff(prev, "day") === 1) {
        currentStreak++;
        maxStreak = Math.max(maxStreak, currentStreak);
      } else {
        currentStreak = 1;
      }
    }

    if (maxStreak >= CONFIG.CONSECUTIVE_DAYS_STREAK) {
      flags.push({
        label: "Long activity streak",
        points: CONFIG.POINTS_CONTINUOUS_ACTIVITY,
        detail: `${maxStreak} days in a row with activity`,
      });
    }

    // External repo spread
    // Only count repos the user doesn't own
    // Only flag for young accounts - established OSS devs often contribute widely
    if (isNewOrYoungAccount) {
      const externalRepos = new Set(
        events
          .map((e) => e.repo?.name)
          .filter((name): name is string => {
            if (!name) return false;
            const repoOwner = name.split("/")[0]?.toLowerCase();
            return repoOwner !== userLogin;
          }),
      );

      if (externalRepos.size >= CONFIG.REPO_SPREAD_EXTREME) {
        flags.push({
          label: "Highly distributed activity",
          points: CONFIG.POINTS_EXTREME_REPO_SPREAD_YOUNG,
          detail: `Activity spread across ${externalRepos.size} external repositories`,
        });
      } else if (externalRepos.size >= CONFIG.REPO_SPREAD_HIGH) {
        flags.push({
          label: "Distributed activity",
          points: CONFIG.POINTS_WIDE_REPO_SPREAD_YOUNG,
          detail: `Activity spread across ${externalRepos.size} external repositories`,
        });
      }
    }

    // External PRs
    // check frequency, not just total
    const externalPRs = prEvents.filter((e) => {
      const repoOwner = e.repo?.name?.split("/")[0]?.toLowerCase();
      return repoOwner && repoOwner !== userLogin;
    });

    // Group PRs by day and week
    const now = dayjs();
    const oneWeekAgo = now.subtract(1, "week");
    const oneDayAgo = now.subtract(1, "day");

    const prsThisWeek = externalPRs.filter((e) => dayjs(e.created_at).isAfter(oneWeekAgo));
    const prsToday = externalPRs.filter((e) => dayjs(e.created_at).isAfter(oneDayAgo));

    // Many PRs in a single day
    // only flag extreme cases
    if (prsToday.length >= CONFIG.PRS_TODAY_EXTREME) {
      flags.push({
        label: "High PR volume in the past 24 hours",
        points: CONFIG.POINTS_PR_BURST,
        detail: `${prsToday.length} PRs to other repos in the last 24 hours`,
      });
    } else if (prsThisWeek.length >= CONFIG.PRS_WEEK_HIGH) {
      // Many PRs in a week
      flags.push({
        label: "High PR volume during last week",
        points: CONFIG.POINTS_HIGH_PR_FREQUENCY,
        detail: `${prsThisWeek.length} PRs to other repos this week`,
      });
    }

    // Also flag if lots of PRs AND few personal repos (regardless of time)
    if (externalPRs.length >= CONFIG.EXTERNAL_PRS_MIN && reposCount < CONFIG.PERSONAL_REPOS_LOW) {
      let detail = `${externalPRs.length} PRs to other repos, but only ${reposCount} of their own`;
      if (reposCount === 0) {
        detail = `${externalPRs.length} PRs to other repos, none of their own`;
      }

      flags.push({
        label: "Primarily external contributions",
        points: CONFIG.POINTS_PR_ONLY_CONTRIBUTOR,
        detail,
      });
    }

    // Mostly external activity (not 100%)
    const foreignRatio = foreignEvents.length / events.length;
    if (
      !hasAllExternal &&
      foreignRatio >= CONFIG.FOREIGN_RATIO_HIGH &&
      reposCount < CONFIG.PERSONAL_REPOS_LOW
    ) {
      flags.push({
        label: "Mostly external activity",
        points: CONFIG.POINTS_EXTERNAL_FOCUS,
        detail: `${Math.round(foreignRatio * 100)}% of activity on other people's repos`,
      });
    }
  }

  // Extreme PR spam detection - TIME-WINDOWED (applies to all accounts)
  // Spam is about intensity/velocity, not total count
  if (events.length >= CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
    const allPREvents = events.filter((e) => e.type === "PullRequestEvent");
    const now = dayjs();
    const oneDayAgo = now.subtract(1, "day");
    const oneWeekAgo = now.subtract(1, "week");

    // Count PRs in different time windows
    const prsInLastDay = allPREvents.filter((e) => dayjs(e.created_at).isAfter(oneDayAgo));
    const prsInLastWeek = allPREvents.filter((e) => dayjs(e.created_at).isAfter(oneWeekAgo));

    // Extreme daily spam: 30+ PRs in 24 hours
    if (prsInLastDay.length >= CONFIG.PRS_DAY_EXTREME) {
      flags.push({
        label: "Extreme PR spam (daily)",
        points: CONFIG.POINTS_PRS_DAY_EXTREME,
        detail: `${prsInLastDay.length} PRs in the last 24 hours`,
      });
    }

    // Extreme weekly spam: 100+ PRs in 7 days
    if (prsInLastWeek.length >= CONFIG.PRS_WEEK_EXTREME) {
      flags.push({
        label: "Extreme PR spam (weekly)",
        points: CONFIG.POINTS_PRS_WEEK_EXTREME,
        detail: `${prsInLastWeek.length} PRs in the last 7 days`,
      });
    }
    // Very high weekly spam: 50+ PRs in 7 days (only if not already extreme)
    else if (prsInLastWeek.length >= CONFIG.PRS_WEEK_VERY_HIGH) {
      flags.push({
        label: "Very high PR spam frequency",
        points: CONFIG.POINTS_PRS_WEEK_VERY_HIGH,
        detail: `${prsInLastWeek.length} PRs in the last 7 days`,
      });
    }


    // Distributed PR spam: high PR count across many repos
    // Only check if not already flagged by time-based detection
    if (allPREvents.length >= CONFIG.PRS_SPAM_VOLUME) {
      const hasTimeBasedFlag = flags.some(
        (f) =>
          f.label === "Extreme PR spam (daily)" ||
          f.label === "Extreme PR spam (weekly)" ||
          f.label === "Very high PR spam frequency"
      );

      if (!hasTimeBasedFlag) {
        // Count distinct repos targeted by PRs
        const prTargetRepos = new Set(
          allPREvents
            .map((e) => e.repo?.name)
            .filter((name): name is string => name !== undefined),
        );

        if (prTargetRepos.size >= CONFIG.REPOS_SPAM_SPREAD) {
          // Guard against flagging long-term contributors:
          // Calculate time density and rolling window
          const prTimestamps = allPREvents
            .map((e) => dayjs(e.created_at))
            .sort((a, b) => a.valueOf() - b.valueOf());
          
          const earliestPR = prTimestamps[0];
          const latestPR = prTimestamps[prTimestamps.length - 1];
          const timeSpanDays = latestPR ? latestPR.diff(earliestPR, "days", true) : 0;
          const timeSpanWeeks = timeSpanDays / 7;
          
          // Calculate density: PRs per week
          const prsPerWeek = timeSpanWeeks > 0 ? allPREvents.length / timeSpanWeeks : Infinity;
          
          // Check rolling 30-day window
          const thirtyDaysAgo = dayjs().subtract(30, "days");
          const prsInLast30Days = allPREvents.filter(
            (e) => dayjs(e.created_at).isAfter(thirtyDaysAgo)
          ).length;
          
          // Flag if either:
          // 1. High density (PRs per week exceeds threshold), OR
          // 2. Rolling 30-day window has excessive volume
          const isHighDensity = prsPerWeek >= CONFIG.PRS_SPAM_DENSITY_PER_WEEK;
          const isRolling30DaySpam = prsInLast30Days >= CONFIG.PRS_SPAM_ROLLING_30DAYS;
          
          if (isHighDensity || isRolling30DaySpam) {
            flags.push({
              label: "Distributed PR spam pattern",
              points: CONFIG.POINTS_PR_SPAM_DISTRIBUTED,
              detail: `${allPREvents.length} PRs spread across ${prTargetRepos.size} different repositories${timeSpanDays > 0 ? ` (${prsPerWeek.toFixed(1)} PRs/week)` : ""}`,
            });
          }
        }
      }
    }
  }

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
