import { CONFIG } from "../config";
import { daysBetween, hoursBetween, toTime } from "../time";
import { localDay } from "../timezone";
import type { IdentifyEvent, IdentifyFlag } from "../types";
import { type RampAnchor, rampPoints } from "../utils";

/** Points for forks in a 24 hour window, sliding between the steps below. */
const FORK_24H_RAMP: readonly RampAnchor[] = [
	[CONFIG.FORKS_HIGH, CONFIG.POINTS_MULTIPLE_FORKS],
	[CONFIG.FORKS_EXTREME, CONFIG.POINTS_FORK_SURGE],
	[CONFIG.FORKS_SURGE_SEVERE, CONFIG.POINTS_FORK_SURGE_SEVERE],
	[CONFIG.FORKS_SURGE_EXTREME_HIGH, CONFIG.POINTS_FORK_SURGE_EXTREME_HIGH],
];

export function detectForkActivity(
	events: IdentifyEvent[],
	tzOffsetHours = 0,
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	// Fork surge - applies uniformly to all accounts (detects time-based spike in forking)
	// Elevated fork frequency applies uniformly regardless of account age
	const forkEvents = events.filter((e) => e.type === "fork");

	if (forkEvents.length < CONFIG.FORKS_HIGH) {
		return flags;
	}

	// Sort events and timestamps together so indices stay in sync
	const sortedForkEntries = [...forkEvents]
		.map((e) => ({ event: e, time: toTime(e.at) }))
		.sort((a, b) => a.time - b.time);
	const forkTimestamps = sortedForkEntries.map((e) => e.time);

	// Helper to find the densest window: returns count and the window's start/end indices
	const findMaxForksInWindow = (
		hours: number,
	): { count: number; startIdx: number; endIdx: number } => {
		let maxForks = 0;
		let maxStart = 0;
		let maxEnd = 0;
		let windowStartIdx = 0;

		for (
			let windowEndIdx = 0;
			windowEndIdx < forkTimestamps.length;
			windowEndIdx++
		) {
			const windowEnd = forkTimestamps[windowEndIdx];

			while (
				windowEnd &&
				hoursBetween(forkTimestamps[windowStartIdx], windowEnd) > hours
			) {
				windowStartIdx++;
			}

			const forksInWindow = windowEndIdx - windowStartIdx + 1;
			if (forksInWindow > maxForks) {
				maxForks = forksInWindow;
				maxStart = windowStartIdx;
				maxEnd = windowEndIdx;
			}
		}

		return { count: maxForks, startIdx: maxStart, endIdx: maxEnd };
	};

	// Calculate all time windows at once
	const window24h = findMaxForksInWindow(24);
	const window48h = findMaxForksInWindow(48);
	const window72h = findMaxForksInWindow(72);
	const maxForksIn24h = window24h.count;
	const maxForksIn48h = window48h.count;
	const maxForksIn72h = window72h.count;

	// Evaluate all qualifying windows as candidates, then pick the most severe by points.
	// Using independent if-blocks for 48h/72h prevents a weaker 24h match from hiding
	// a stronger multi-day surge.
	const forkSpikeCandidates: IdentifyFlag[] = [];
	const forks24hPoints = rampPoints(maxForksIn24h, FORK_24H_RAMP);

	// 24h window — descending severity, at most one candidate added
	if (maxForksIn24h >= CONFIG.FORKS_SURGE_EXTREME_HIGH) {
		const windowEvents = sortedForkEntries
			.slice(window24h.startIdx, window24h.endIdx + 1)
			.map((e) => e.event);

		forkSpikeCandidates.push({
			id: "fork-extreme",
			points: forks24hPoints,
			group: "fork",
			amplifiable: true,
			facts: { forks: maxForksIn24h, totalForks: forkEvents.length },
			events: windowEvents,
		});
	} else if (maxForksIn24h >= CONFIG.FORKS_SURGE_SEVERE) {
		const windowEvents = sortedForkEntries
			.slice(window24h.startIdx, window24h.endIdx + 1)
			.map((e) => e.event);

		forkSpikeCandidates.push({
			id: "fork-severe",
			points: forks24hPoints,
			group: "fork",
			amplifiable: true,
			facts: { forks: maxForksIn24h, totalForks: forkEvents.length },
			events: windowEvents,
		});
	} else if (maxForksIn24h >= CONFIG.FORKS_EXTREME) {
		const windowEvents = sortedForkEntries
			.slice(window24h.startIdx, window24h.endIdx + 1)
			.map((e) => e.event);

		forkSpikeCandidates.push({
			id: "fork-spike",
			points: forks24hPoints,
			group: "fork",
			amplifiable: true,
			facts: { forks: maxForksIn24h, totalForks: forkEvents.length },
			events: windowEvents,
		});
	} else if (maxForksIn24h >= CONFIG.FORKS_HIGH) {
		const windowEvents = sortedForkEntries
			.slice(window24h.startIdx, window24h.endIdx + 1)
			.map((e) => e.event);

		forkSpikeCandidates.push({
			id: "fork-multiple",
			points: forks24hPoints,
			group: "fork",
			amplifiable: true,
			facts: { forks: maxForksIn24h, totalForks: forkEvents.length },
			events: windowEvents,
		});
	}

	// 48h window — evaluated independently so it can outrank a weaker 24h match
	if (maxForksIn48h >= CONFIG.FORKS_SURGE_48H) {
		const windowEvents = sortedForkEntries
			.slice(window48h.startIdx, window48h.endIdx + 1)
			.map((e) => e.event);

		forkSpikeCandidates.push({
			id: "fork-surge-48h",
			points: CONFIG.POINTS_FORK_SURGE_48H,
			group: "fork",
			amplifiable: true,
			facts: { forks: maxForksIn48h, totalForks: forkEvents.length },
			events: windowEvents,
		});
	}

	// 72h window — evaluated independently so it can outrank a weaker 24h match
	if (maxForksIn72h >= CONFIG.FORKS_SURGE_72H) {
		const windowEvents = sortedForkEntries
			.slice(window72h.startIdx, window72h.endIdx + 1)
			.map((e) => e.event);

		forkSpikeCandidates.push({
			id: "fork-surge-72h",
			points: CONFIG.POINTS_FORK_SURGE_72H,
			group: "fork",
			amplifiable: true,
			facts: { forks: maxForksIn72h, totalForks: forkEvents.length },
			events: windowEvents,
		});
	}

	const forkSpikeFlag = forkSpikeCandidates.reduce<IdentifyFlag | null>(
		(best, c) => (!best || c.points > best.points ? c : best),
		null,
	);

	// Add the single most severe spike flag
	if (forkSpikeFlag) {
		flags.push(forkSpikeFlag);
	}

	// Fork rate metric (forks per day over activity period)
	// Only applies if we haven't already flagged a 24h spike
	// AND activity is genuinely sustained (3+ days, not single-day spikes)
	if (forkTimestamps.length > 0 && !forkSpikeFlag) {
		const oldestFork = forkTimestamps[0];
		const newestFork = forkTimestamps[forkTimestamps.length - 1];

		if (oldestFork && newestFork) {
			const forkSpanDays = Math.max(
				1,
				Math.trunc(daysBetween(oldestFork, newestFork)),
			);
			const forksPerDay = forkEvents.length / forkSpanDays;

			// Only flag as "sustained" if activity spans 3+ days (not single-day bursts)
			if (forksPerDay >= CONFIG.FORKS_PER_DAY_HIGH && forkSpanDays >= 3) {
				flags.push({
					id: "fork-rate",
					points: CONFIG.POINTS_FORKS_PER_DAY_HIGH,
					group: "fork",
					amplifiable: true,
					facts: {
						perDay: forksPerDay,
						spanDays: forkSpanDays,
						totalForks: forkEvents.length,
					},
					events: forkEvents,
				});
			}
		}
	}

	// Consecutive days of forking - only flag if it's a distributed pattern
	// Not a single concentrated burst (which is already flagged above)
	// Group by day in the account's own local time, so one late night of forking
	// counts as one day and not two
	// Events without a usable timestamp are skipped: they cannot belong to a day,
	// and a placeholder key would inflate the day count and break the streak sort
	const forkDays = new Set<string>();
	forkEvents.forEach((e) => {
		const day = localDay(e.at, tzOffsetHours);
		if (!day) {
			return;
		}

		forkDays.add(day);
	});

	if (forkDays.size >= CONFIG.CONSECUTIVE_FORK_DAYS && !forkSpikeFlag) {
		const sortedForkDays = Array.from(forkDays)
			.map((day) => toTime(day))
			.sort((a, b) => a - b);

		let maxConsecutiveForkDays = 1;
		let currentStreak = 1;
		let streakEnd = 0;
		let maxStreakEnd = 0;

		for (let i = 1; i < sortedForkDays.length; i++) {
			const prev = sortedForkDays[i - 1];
			const curr = sortedForkDays[i];

			if (daysBetween(prev, curr) === 1) {
				currentStreak++;
				streakEnd = i;
				if (currentStreak > maxConsecutiveForkDays) {
					maxConsecutiveForkDays = currentStreak;
					maxStreakEnd = streakEnd;
				}
			} else {
				currentStreak = 1;
				streakEnd = i;
			}
		}

		if (maxConsecutiveForkDays >= CONFIG.CONSECUTIVE_FORK_DAYS) {
			const streakStartDay =
				sortedForkDays[maxStreakEnd - maxConsecutiveForkDays + 1];
			const streakEndDay = sortedForkDays[maxStreakEnd];
			const streakEvents = forkEvents.filter((e) => {
				const day = toTime(localDay(e.at, tzOffsetHours));

				return day >= streakStartDay && day <= streakEndDay;
			});

			const totalDays = forkDays.size;

			flags.push({
				id: "fork-streak",
				points: CONFIG.POINTS_CONSECUTIVE_FORK_DAYS,
				group: "fork",
				amplifiable: true,
				facts: {
					streakDays: maxConsecutiveForkDays,
					activeDays: totalDays,
					totalForks: forkEvents.length,
				},
				events: streakEvents,
			});
		}
	}

	// Fork repository diversity (spreading across many different repos)
	// Skip if we already flagged a spike (spike detection is more severe and already covers the attack)
	const forkedRepos = new Set<string>(forkEvents.map((e) => e.repo));

	if (forkedRepos.size >= CONFIG.FORK_REPO_DIVERSITY_HIGH && !forkSpikeFlag) {
		let spanDaysValue = 0;
		if (forkTimestamps.length > 1) {
			const earliestFork = forkTimestamps[0];
			const latestFork = forkTimestamps[forkTimestamps.length - 1];
			spanDaysValue = Math.trunc(daysBetween(earliestFork, latestFork));
		}

		flags.push({
			id: "fork-scatter",
			points: CONFIG.POINTS_FORK_DIVERSITY,
			group: "fork",
			amplifiable: true,
			facts: {
				repos: forkedRepos.size,
				totalForks: forkEvents.length,
				spanDays: spanDaysValue,
			},
			events: forkEvents,
		});
	}

	return flags;
}

export function detectForkCombinedActivity(
	events: IdentifyEvent[],
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	// Fork + coordinated activity combo (forks + branches + PRs = chained automation)
	// Verify actual chaining: branches in forked repos, PRs targeting forked repos, temporal order
	const forkEvents = events.filter((e) => e.type === "fork");

	if (
		forkEvents.length < CONFIG.FORK_COMBINED_ACTIVITY_MIN ||
		events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS
	) {
		return flags;
	}

	// Get repos that were forked
	const forkedRepoNames = new Set(forkEvents.map((e) => e.repo));

	// Find branches created in forked repos
	const branchCreateEvents = events.filter(
		(e) => e.type === "create" && e.ref?.type === "branch",
	);
	const branchesInForkedRepos = branchCreateEvents.filter((e) =>
		forkedRepoNames.has(e.repo),
	);

	// Find PRs targeting forked repos
	const allPREvents = events.filter(
		(e) => e.type === "pull-request" && e.action === "opened",
	);
	const prsInForkedRepos = allPREvents.filter((e) =>
		forkedRepoNames.has(e.repo),
	);

	// Verify temporal chaining: forks → branches → PRs
	if (
		branchesInForkedRepos.length >= CONFIG.FORK_COMBINED_BRANCHES &&
		prsInForkedRepos.length >= CONFIG.FORK_COMBINED_PRS
	) {
		const forkTimestamps = forkEvents.map((e) => toTime(e.at));
		const branchTimestamps = branchesInForkedRepos.map((e) => toTime(e.at));
		const prTimestamps = prsInForkedRepos.map((e) => toTime(e.at));

		const latestFork = Math.max(...forkTimestamps);
		const earliestBranch = Math.min(...branchTimestamps);
		const earliestPR = Math.min(...prTimestamps);

		// Check if there's a temporal sequence: forks before branches before PRs
		// Relaxed ratio check (2.0x tolerance) to account for potential incomplete event history
		const isChainingEvident =
			latestFork < earliestBranch &&
			earliestBranch < earliestPR &&
			prsInForkedRepos.length <= branchesInForkedRepos.length * 2.0;

		if (isChainingEvident) {
			flags.push({
				id: "fork-chain",
				points: CONFIG.POINTS_FORK_COMBINED_ACTIVITY,
				group: "fork",
				amplifiable: true,
				facts: {
					forks: forkEvents.length,
					branches: branchesInForkedRepos.length,
					prs: prsInForkedRepos.length,
				},
				events: [...forkEvents, ...branchesInForkedRepos, ...prsInForkedRepos],
			});
		}
	}

	return flags;
}
