import dayjs from "dayjs";
import minMax from "dayjs/plugin/minMax";
import utc from "dayjs/plugin/utc";
import { CONFIG } from "../config";
import type { GitHubEvent, IdentifyFlag } from "../types";

dayjs.extend(utc);
dayjs.extend(minMax);

export function detectForkActivity(events: GitHubEvent[]): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	// Fork surge - applies uniformly to all accounts (detects time-based spike in forking)
	// Elevated fork frequency applies uniformly regardless of account age
	const forkEvents = events.filter((e) => e.type === "ForkEvent");

	if (forkEvents.length < CONFIG.FORKS_HIGH) {
		return flags;
	}

	// Sort events and timestamps together so indices stay in sync
	const sortedForkEntries = [...forkEvents]
		.map((e) => ({ event: e, time: dayjs(e.created_at) }))
		.sort((a, b) => a.time.valueOf() - b.time.valueOf());
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
				windowEnd.diff(forkTimestamps[windowStartIdx], "hour", true) > hours
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

	// Determine which time window to flag (only flag the MOST SEVERE, not all)
	// This avoids redundant overlapping alerts
	let forkSpikeFlag: IdentifyFlag | null = null;

	// Check 24-hour window first (most specific, densest activity)
	if (maxForksIn24h >= CONFIG.FORKS_SURGE_EXTREME_HIGH) {
		const windowEvents = sortedForkEntries
			.slice(window24h.startIdx, window24h.endIdx + 1)
			.map((e) => e.event);
		forkSpikeFlag = {
			label: "Extreme fork automation",
			points: CONFIG.POINTS_FORK_SURGE_EXTREME_HIGH,
			amplifiable: true,
			detail: `${maxForksIn24h} repositories forked in rapid succession (within 24 hours)`,
			data: [
				{ label: "Forks in 24h window", value: maxForksIn24h, threshold: CONFIG.FORKS_SURGE_EXTREME_HIGH },
				{ label: "Total forks observed", value: forkEvents.length },
			],
			events: windowEvents,
		};
	} else if (maxForksIn24h >= CONFIG.FORKS_SURGE_SEVERE) {
		const windowEvents = sortedForkEntries
			.slice(window24h.startIdx, window24h.endIdx + 1)
			.map((e) => e.event);
		forkSpikeFlag = {
			label: "Severe fork surge",
			points: CONFIG.POINTS_FORK_SURGE_SEVERE,
			amplifiable: true,
			detail: `${maxForksIn24h} repositories forked in rapid succession (within 24 hours)`,
			data: [
				{ label: "Forks in 24h window", value: maxForksIn24h, threshold: CONFIG.FORKS_SURGE_SEVERE },
				{ label: "Total forks observed", value: forkEvents.length },
			],
			events: windowEvents,
		};
	} else if (maxForksIn24h >= CONFIG.FORKS_EXTREME) {
		const windowEvents = sortedForkEntries
			.slice(window24h.startIdx, window24h.endIdx + 1)
			.map((e) => e.event);
		forkSpikeFlag = {
			label: "Fork spike detected",
			points: CONFIG.POINTS_FORK_SURGE,
			amplifiable: true,
			detail: `Burst of ${maxForksIn24h} fork events in a single 24-hour window`,
			data: [
				{ label: "Forks in 24h window", value: maxForksIn24h, threshold: CONFIG.FORKS_EXTREME },
				{ label: "Total forks observed", value: forkEvents.length },
			],
			events: windowEvents,
		};
	} else if (maxForksIn24h >= CONFIG.FORKS_HIGH) {
		const windowEvents = sortedForkEntries
			.slice(window24h.startIdx, window24h.endIdx + 1)
			.map((e) => e.event);
		forkSpikeFlag = {
			label: "Multiple forks",
			points: CONFIG.POINTS_MULTIPLE_FORKS,
			amplifiable: true,
			detail: `${maxForksIn24h} repositories forked in a single 24-hour window`,
			data: [
				{ label: "Forks in 24h window", value: maxForksIn24h, threshold: CONFIG.FORKS_HIGH },
				{ label: "Total forks observed", value: forkEvents.length },
			],
			events: windowEvents,
		};
	}
	// Fall back to 48-hour if 24h thresholds not met
	else if (maxForksIn48h >= CONFIG.FORKS_SURGE_48H) {
		const windowEvents = sortedForkEntries
			.slice(window48h.startIdx, window48h.endIdx + 1)
			.map((e) => e.event);
		forkSpikeFlag = {
			label: "Multi-day fork surge",
			points: CONFIG.POINTS_FORK_SURGE_48H,
			amplifiable: true,
			detail: `Concentrated burst: ${maxForksIn48h} repositories forked over 2 days`,
			data: [
				{ label: "Forks in 48h window", value: maxForksIn48h, threshold: CONFIG.FORKS_SURGE_48H },
				{ label: "Total forks observed", value: forkEvents.length },
			],
			events: windowEvents,
		};
	}
	// Finally check 72-hour window
	else if (maxForksIn72h >= CONFIG.FORKS_SURGE_72H) {
		const windowEvents = sortedForkEntries
			.slice(window72h.startIdx, window72h.endIdx + 1)
			.map((e) => e.event);
		forkSpikeFlag = {
			label: "Severe multi-day fork surge",
			points: CONFIG.POINTS_FORK_SURGE_72H,
			amplifiable: true,
			detail: `Rapid burst: ${maxForksIn72h} repositories forked over 72 hours`,
			data: [
				{ label: "Forks in 72h window", value: maxForksIn72h, threshold: CONFIG.FORKS_SURGE_72H },
				{ label: "Total forks observed", value: forkEvents.length },
			],
			events: windowEvents,
		};
	}

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
			const forkSpanDays = Math.max(1, newestFork.diff(oldestFork, "day"));
			const forksPerDay = forkEvents.length / forkSpanDays;

			// Only flag as "sustained" if activity spans 3+ days (not single-day bursts)
			if (forksPerDay >= CONFIG.FORKS_PER_DAY_HIGH && forkSpanDays >= 3) {
				flags.push({
					label: "Sustained fork rate",
					points: CONFIG.POINTS_FORKS_PER_DAY_HIGH,
					amplifiable: true,
					detail: `Average of ${forksPerDay.toFixed(1)} forks per day over ${forkSpanDays} days (${forkEvents.length} total)`,
					data: [
						{ label: "Forks per day", value: parseFloat(forksPerDay.toFixed(1)), threshold: CONFIG.FORKS_PER_DAY_HIGH },
						{ label: "Activity span (days)", value: forkSpanDays },
						{ label: "Total forks", value: forkEvents.length },
					],
					events: forkEvents,
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

	if (forkDays.size >= CONFIG.CONSECUTIVE_FORK_DAYS && !forkSpikeFlag) {
		const sortedForkDays = Array.from(forkDays)
			.map((d) => dayjs(d, "YYYY-MM-DD"))
			.sort((a, b) => a.valueOf() - b.valueOf());

		let maxConsecutiveForkDays = 1;
		let currentStreak = 1;
		let streakEnd = 0;
		let maxStreakEnd = 0;

		for (let i = 1; i < sortedForkDays.length; i++) {
			const prev = sortedForkDays[i - 1];
			const curr = sortedForkDays[i];

			if (curr && prev && curr.diff(prev, "day") === 1) {
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
			const streakStartDay = sortedForkDays[maxStreakEnd - maxConsecutiveForkDays + 1];
			const streakEndDay = sortedForkDays[maxStreakEnd];
			const streakEvents = forkEvents.filter((e) => {
				const day = dayjs.utc(e.created_at).format("YYYY-MM-DD");
				return (
					streakStartDay &&
					streakEndDay &&
					!dayjs(day).isBefore(streakStartDay) &&
					!dayjs(day).isAfter(streakEndDay)
				);
			});
			const totalDays = forkDays.size;
			flags.push({
				label: "Extended forking pattern",
				points: CONFIG.POINTS_CONSECUTIVE_FORK_DAYS,
				amplifiable: true,
				detail: `Forking activity on ${totalDays} days (${maxConsecutiveForkDays} consecutive), ${forkEvents.length} repositories total`,
				data: [
					{ label: "Consecutive fork days", value: maxConsecutiveForkDays, threshold: CONFIG.CONSECUTIVE_FORK_DAYS },
					{ label: "Total active days", value: totalDays },
					{ label: "Total forks", value: forkEvents.length },
				],
				events: streakEvents,
			});
		}
	}

	// Fork repository diversity (spreading across many different repos)
	// Skip if we already flagged a spike (spike detection is more severe and already covers the attack)
	const forkedRepos = new Set<string>(
		forkEvents.map((e) => e.repo?.name).filter((name) => name !== undefined),
	);

	if (forkedRepos.size >= CONFIG.FORK_REPO_DIVERSITY_HIGH && !forkSpikeFlag) {
		let timeSpanDetail = "";
		let spanDaysValue = 0;
		if (forkTimestamps.length > 1) {
			const earliestFork = forkTimestamps[0];
			const latestFork = forkTimestamps[forkTimestamps.length - 1];
			spanDaysValue = latestFork.diff(earliestFork, "day");
			timeSpanDetail =
				spanDaysValue > 0 ? ` over ${spanDaysValue} days` : " in a short timeframe";
		}

		flags.push({
			label: "Fork scatter pattern",
			points: CONFIG.POINTS_FORK_DIVERSITY,
			amplifiable: true,
			detail: `Forks spread across ${forkedRepos.size} different repositories${timeSpanDetail}`,
			data: [
				{ label: "Distinct repos forked", value: forkedRepos.size, threshold: CONFIG.FORK_REPO_DIVERSITY_HIGH },
				{ label: "Total forks", value: forkEvents.length },
				{ label: "Activity span (days)", value: spanDaysValue },
			],
			events: forkEvents,
		});
	}

	return flags;
}

export function detectForkCombinedActivity(
	events: GitHubEvent[],
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	// Fork + coordinated activity combo (forks + branches + PRs = chained automation)
	// Verify actual chaining: branches in forked repos, PRs targeting forked repos, temporal order
	const forkEvents = events.filter((e) => e.type === "ForkEvent");

	if (
		forkEvents.length < CONFIG.FORK_COMBINED_ACTIVITY_MIN ||
		events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS
	) {
		return flags;
	}

	// Get repos that were forked
	const forkedRepoNames = new Set(
		forkEvents.map((e) => e.repo?.name).filter((name) => name !== undefined),
	);

	// Find branches created in forked repos
	const branchCreateEvents = events.filter(
		(e) => e.type === "CreateEvent" && e.payload?.ref_type === "branch",
	);
	const branchesInForkedRepos = branchCreateEvents.filter((e) =>
		forkedRepoNames.has(e.repo?.name || ""),
	);

	// Find PRs targeting forked repos
	const allPREvents = events.filter(
		(e) => e.type === "PullRequestEvent" && e.payload?.action === "opened",
	);
	const prsInForkedRepos = allPREvents.filter((e) =>
		forkedRepoNames.has(e.repo?.name || ""),
	);

	// Verify temporal chaining: forks → branches → PRs
	if (
		branchesInForkedRepos.length >= CONFIG.FORK_COMBINED_BRANCHES &&
		prsInForkedRepos.length >= CONFIG.FORK_COMBINED_PRS
	) {
		const forkTimestamps = forkEvents.map((e) => dayjs(e.created_at));
		const branchTimestamps = branchesInForkedRepos.map((e) =>
			dayjs(e.created_at),
		);
		const prTimestamps = prsInForkedRepos.map((e) => dayjs(e.created_at));

		const latestFork = dayjs.max(forkTimestamps);
		const earliestBranch = dayjs.min(branchTimestamps);
		const earliestPR = dayjs.min(prTimestamps);

		// Check if there's a temporal sequence: forks before branches before PRs
		// Relaxed ratio check (2.0x tolerance) to account for potential incomplete event history
		const isChainingEvident =
			latestFork &&
			earliestBranch &&
			earliestPR &&
			latestFork.isBefore(earliestBranch) &&
			earliestBranch.isBefore(earliestPR) &&
			prsInForkedRepos.length <= branchesInForkedRepos.length * 2.0;

		if (isChainingEvident) {
			const totalOps =
				forkEvents.length +
				branchesInForkedRepos.length +
				prsInForkedRepos.length;
			flags.push({
				label: "Chained automation pattern",
				points: CONFIG.POINTS_FORK_COMBINED_ACTIVITY,
				amplifiable: true,
				detail: `${totalOps} chained repository operations: ${forkEvents.length} forks followed by ${branchesInForkedRepos.length} branches, then ${prsInForkedRepos.length} pull requests (based on available event history)`,
				data: [
					{ label: "Fork events", value: forkEvents.length },
					{ label: "Branch creates in forked repos", value: branchesInForkedRepos.length },
					{ label: "PRs from forked repos", value: prsInForkedRepos.length },
					{ label: "Total chained operations", value: totalOps },
				],
				events: [...forkEvents, ...branchesInForkedRepos, ...prsInForkedRepos],
			});
		}
	}

	return flags;
}
