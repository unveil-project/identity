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
	densestDistinctWindow,
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

const HOURS_PER_WEEK = 24 * 7;

function forkedRepo(fork: ActivityEvent): string {
	return fork.repo;
}

/**
 * Different repos forked per week, over the whole time we see.
 * A span shorter than one week counts as one week, so a few days of
 * forking is not stretched into a huge weekly number.
 */
function reposPerWeek(repos: number, days: number): number {
	const weeks = Math.max(1, days / 7);

	return repos / weeks;
}

/**
 * Forks spread over many different repositories.
 *
 * The number of repos alone says little: many people fork 15 repos in a
 * month. So the points add up three parts:
 * - volume: how many different repos
 * - speed: how many different repos per week, on average
 * - intensity: the most different repos in any 7 days
 * A calm pace gets few points, even with many repos.
 */
function detectForkScatter(forks: ActivityEvent[]): Flag[] {
	const repos = new Set(forks.map(forkedRepo)).size;

	if (repos < CONFIG.FORK_REPO_DIVERSITY_HIGH) {
		return [];
	}

	const days = spanDays(forks.map(eventTime));
	const perWeek = reposPerWeek(repos, days);
	const busiestWeek = densestDistinctWindow(
		forks,
		eventTime,
		forkedRepo,
		HOURS_PER_WEEK,
	);

	const volumePoints = rampPoints(repos, CONFIG.FORK_SCATTER_VOLUME_RAMP);
	const speedPoints = rampPoints(perWeek, CONFIG.FORK_SCATTER_SPEED_RAMP);
	const intensityPoints = rampPoints(
		busiestWeek.distinct,
		CONFIG.FORK_SCATTER_INTENSITY_RAMP,
	);

	return [
		{
			id: "fork-scatter",
			points: volumePoints + speedPoints + intensityPoints,
			group: "fork",
			amplifiable: true,
			facts: {
				repos,
				totalForks: forks.length,
				spanDays: Math.trunc(days),
				reposPerWeek: Math.round(perWeek * 10) / 10,
				busiestWeekRepos: busiestWeek.distinct,
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

	const spike = strongestForkSpike(forks);
	if (spike) {
		return [strongerSpikeOrScatter(spike, detectForkScatter(forks))];
	}

	return [
		...detectForkRate(forks),
		...detectForkStreak(forks, tzOffsetHours),
		...detectForkScatter(forks),
	];
}

function strongerSpikeOrScatter(spike: Flag, scatterFlags: Flag[]): Flag {
	const scatter = scatterFlags[0];
	if (scatter && scatter.points > spike.points) {
		return scatter;
	}

	return spike;
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
