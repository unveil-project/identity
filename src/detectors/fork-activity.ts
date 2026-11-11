import { CONFIG } from "../config";
import {
	densestEventWindow,
	eventTime,
	isBranchCreation,
	isOpenedPR,
} from "../events";
import { longestDayStreak, spanDays, timeRange } from "../time";
import { localDay } from "../timezone";
import type { ActivityEvent, Flag, FlagId } from "../types";
import {
	type DensestWindow,
	levelFor,
	type RampAnchor,
	rampPoints,
} from "../utils";

const FORK_24H_LEVELS = [
	{ min: CONFIG.FORKS_HIGH, id: "fork-multiple" },
	{ min: CONFIG.FORKS_EXTREME, id: "fork-spike" },
	{ min: CONFIG.FORKS_SURGE_SEVERE, id: "fork-severe" },
	{ min: CONFIG.FORKS_SURGE_EXTREME_HIGH, id: "fork-extreme" },
] as const;

/** Points for forks in a 24 hour window, sliding between the steps below. */
const FORK_24H_RAMP: readonly RampAnchor[] = [
	[CONFIG.FORKS_HIGH, CONFIG.POINTS_MULTIPLE_FORKS],
	[CONFIG.FORKS_EXTREME, CONFIG.POINTS_FORK_SURGE],
	[CONFIG.FORKS_SURGE_SEVERE, CONFIG.POINTS_FORK_SURGE_SEVERE],
	[CONFIG.FORKS_SURGE_EXTREME_HIGH, CONFIG.POINTS_FORK_SURGE_EXTREME_HIGH],
];

type ForkWindowId = Extract<
	FlagId,
	(typeof FORK_24H_LEVELS)[number]["id"] | "fork-surge-48h" | "fork-surge-72h"
>;

function forkWindowFlag(
	id: ForkWindowId,
	points: number,
	window: DensestWindow<ActivityEvent>,
	totalForks: number,
): Flag {
	return {
		id,
		points,
		group: "fork",
		amplifiable: true,
		facts: { forks: window.count, totalForks },
		events: window.items,
	};
}

/**
 * The most severe burst of forks within one, two or three days. The longer
 * windows are checked on their own, so a small 24 hour burst cannot hide a
 * bigger one spread over a few days.
 */
function strongestForkSpike(forks: ActivityEvent[]): Flag | undefined {
	const candidates: Flag[] = [];

	const oneDay = densestEventWindow(forks, 24);
	const oneDayLevel = levelFor(oneDay.count, FORK_24H_LEVELS);
	if (oneDayLevel) {
		const points = rampPoints(oneDay.count, FORK_24H_RAMP);
		candidates.push(
			forkWindowFlag(oneDayLevel.id, points, oneDay, forks.length),
		);
	}

	const twoDays = densestEventWindow(forks, 48);
	if (twoDays.count >= CONFIG.FORKS_SURGE_48H) {
		const points = CONFIG.POINTS_FORK_SURGE_48H;
		candidates.push(
			forkWindowFlag("fork-surge-48h", points, twoDays, forks.length),
		);
	}

	const threeDays = densestEventWindow(forks, 72);
	if (threeDays.count >= CONFIG.FORKS_SURGE_72H) {
		const points = CONFIG.POINTS_FORK_SURGE_72H;
		candidates.push(
			forkWindowFlag("fork-surge-72h", points, threeDays, forks.length),
		);
	}

	let strongest: Flag | undefined;
	for (const candidate of candidates) {
		if (!strongest || candidate.points > strongest.points) {
			strongest = candidate;
		}
	}

	return strongest;
}

/** A high average number of forks per day, kept up over several days. */
function detectForkRate(forks: ActivityEvent[]): Flag[] {
	const days = Math.max(1, Math.trunc(spanDays(forks.map(eventTime))));
	const perDay = forks.length / days;

	const isSustained =
		perDay >= CONFIG.FORKS_PER_DAY_HIGH &&
		days >= CONFIG.FORK_RATE_MIN_SPAN_DAYS;
	if (!isSustained) {
		return [];
	}

	return [
		{
			id: "fork-rate",
			points: CONFIG.POINTS_FORKS_PER_DAY_HIGH,
			group: "fork",
			amplifiable: true,
			facts: { perDay, spanDays: days, totalForks: forks.length },
			events: forks,
		},
	];
}

/**
 * Forking on many days in a row. Days use the account's own local time, so a
 * late night of forking counts as one day and not two.
 */
function detectForkStreak(
	forks: ActivityEvent[],
	tzOffsetHours: number,
): Flag[] {
	const dayOf = (fork: ActivityEvent) => localDay(fork.at, tzOffsetHours);
	const activeDays = new Set(forks.map(dayOf).filter(Boolean));

	if (activeDays.size < CONFIG.CONSECUTIVE_FORK_DAYS) {
		return [];
	}

	const streak = longestDayStreak(activeDays);
	if (!streak || streak.length < CONFIG.CONSECUTIVE_FORK_DAYS) {
		return [];
	}

	const streakForks = forks.filter((fork) => {
		const day = dayOf(fork);

		return day >= streak.firstDay && day <= streak.lastDay;
	});

	return [
		{
			id: "fork-streak",
			points: CONFIG.POINTS_CONSECUTIVE_FORK_DAYS,
			group: "fork",
			amplifiable: true,
			facts: {
				streakDays: streak.length,
				activeDays: activeDays.size,
				totalForks: forks.length,
			},
			events: streakForks,
		},
	];
}

/** Forks spread over many different repositories. */
function detectForkScatter(forks: ActivityEvent[]): Flag[] {
	const repos = new Set(forks.map((fork) => fork.repo));

	if (repos.size < CONFIG.FORK_REPO_DIVERSITY_HIGH) {
		return [];
	}

	return [
		{
			id: "fork-scatter",
			points: CONFIG.POINTS_FORK_DIVERSITY,
			group: "fork",
			amplifiable: true,
			facts: {
				repos: repos.size,
				totalForks: forks.length,
				spanDays: Math.trunc(spanDays(forks.map(eventTime))),
			},
			events: forks,
		},
	];
}

export function detectForkActivity(
	events: ActivityEvent[],
	tzOffsetHours = 0,
): Flag[] {
	const forks = events.filter((event) => event.type === "fork");

	if (forks.length < CONFIG.FORKS_HIGH) {
		return [];
	}

	// A burst is the strongest fork signal. When there is one, the slower
	// patterns below would only describe the same forks again.
	const spike = strongestForkSpike(forks);
	if (spike) {
		return [spike];
	}

	return [
		...detectForkRate(forks),
		...detectForkStreak(forks, tzOffsetHours),
		...detectForkScatter(forks),
	];
}

/**
 * Forks first, then branches, then PRs, each step finished before the next
 * one starts: a script working through a list of repositories.
 */
export function detectForkCombinedActivity(events: ActivityEvent[]): Flag[] {
	const forks = events.filter((event) => event.type === "fork");

	if (
		forks.length < CONFIG.FORK_COMBINED_ACTIVITY_MIN ||
		events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS
	) {
		return [];
	}

	const forkedRepos = new Set(forks.map((fork) => fork.repo));
	const branches = events.filter(
		(event) => isBranchCreation(event) && forkedRepos.has(event.repo),
	);
	const prs = events.filter(
		(event) => isOpenedPR(event) && forkedRepos.has(event.repo),
	);

	if (
		branches.length < CONFIG.FORK_COMBINED_BRANCHES ||
		prs.length < CONFIG.FORK_COMBINED_PRS
	) {
		return [];
	}

	const forkTimes = timeRange(forks.map(eventTime));
	const branchTimes = timeRange(branches.map(eventTime));
	const prTimes = timeRange(prs.map(eventTime));
	if (!forkTimes || !branchTimes || !prTimes) {
		return [];
	}

	const isChained =
		forkTimes.end < branchTimes.start &&
		branchTimes.start < prTimes.start &&
		prs.length <= branches.length * CONFIG.FORK_COMBINED_MAX_PRS_PER_BRANCH;

	if (!isChained) {
		return [];
	}

	return [
		{
			id: "fork-chain",
			points: CONFIG.POINTS_FORK_COMBINED_ACTIVITY,
			group: "fork",
			amplifiable: true,
			facts: {
				forks: forks.length,
				branches: branches.length,
				prs: prs.length,
			},
			events: [...forks, ...branches, ...prs],
		},
	];
}
