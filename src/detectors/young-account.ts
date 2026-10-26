import { CONFIG } from "../config";
import { daysBetween, toTime } from "../time";
import { localDay, localHour } from "../timezone";
import type { ActivityEvent, Flag } from "../types";
import {
	calculateNormalizedShannonsEntropy,
	densestEventWindow,
	ownerOf,
} from "../utils";

export function detectYoungAccountActivity(
	events: ActivityEvent[],
	reposCount: number,
	isNewOrYoungAccount: boolean,
	accountName: string,
	tzOffsetHours = 0,
): Flag[] {
	const flags: Flag[] = [];

	if (!isNewOrYoungAccount || events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return flags;
	}

	const userLogin = accountName.toLowerCase();

	// PRs (flag more aggressively)
	const prEvents = events.filter(
		(e) => e.type === "pull-request" && e.action === "opened",
	);

	if (prEvents.length >= CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		const timestamps = prEvents.map((e) => toTime(e.at));
		const oldestEvent = Math.min(...timestamps);
		const newestEvent = Math.max(...timestamps);

		if (newestEvent) {
			const eventSpanDays = Math.max(
				1,
				Math.trunc(daysBetween(oldestEvent, newestEvent)),
			);
			const prsPerDay = prEvents.length / eventSpanDays;

			if (prsPerDay >= CONFIG.ACTIVITY_DENSITY_EXTREME / 2) {
				// PRs are much rarer
				flags.push({
					id: "young-pr-volume-extreme",
					points: CONFIG.POINTS_EXTREME_ACTIVITY_DENSITY + 10,
					group: "pr-volume",
					amplifiable: true,
					facts: {
						prs: prEvents.length,
						spanDays: eventSpanDays,
						perDay: prsPerDay,
					},
					events: prEvents,
				});
			} else if (prsPerDay >= CONFIG.ACTIVITY_DENSITY_HIGH / 2) {
				flags.push({
					id: "young-pr-volume-high",
					points: CONFIG.POINTS_HIGH_ACTIVITY_DENSITY + 5,
					group: "pr-volume",
					amplifiable: true,
					facts: {
						prs: prEvents.length,
						spanDays: eventSpanDays,
						perDay: prsPerDay,
					},
					events: prEvents,
				});
			}
		}
	}

	// Unusual daily coding activity detection using Shannon's entropy
	// Automated accounts: uniform hour distribution (high entropy) across many hours
	// Organic accounts: concentrated in certain hours (low entropy/predictable patterns)
	const codingEventTypes = new Set(["push", "pull-request"]);
	const codingEventsWithReviews = events.filter(
		(e) =>
			(e.type && codingEventTypes.has(e.type)) ||
			e.type === "review" ||
			e.type === "review-comment",
	);

	// Group by day and hour in the account's own local time
	const codingEventsByDay = new Map<string, number[]>();
	codingEventsWithReviews.forEach((e) => {
		if (!e.at) {
			return;
		}

		const day = localDay(e.at, tzOffsetHours);
		if (!codingEventsByDay.has(day)) {
			codingEventsByDay.set(day, []);
		}

		codingEventsByDay.get(day)?.push(localHour(e.at, tzOffsetHours));
	});

	// For each day, analyze hour distribution using entropy
	// Very high entropy (uniform spread) across many hours = unusual activity pattern
	const daysWithUniformDistribution: string[] = [];
	codingEventsByDay.forEach((dayHours, day) => {
		const hourMap = new Map<number, number>();
		dayHours.forEach((hour) => {
			hourMap.set(hour, (hourMap.get(hour) || 0) + 1);
		});

		const uniqueHours = hourMap.size;
		const hourEntropy = calculateNormalizedShannonsEntropy(
			Array.from(hourMap.values()),
		);

		// Only flag days with many hours AND uniform distribution (automation-like)
		if (uniqueHours >= CONFIG.HOURS_PER_DAY_INHUMAN && hourEntropy > 0.8) {
			daysWithUniformDistribution.push(day);
		}
	});

	// Check if these inhuman days are consecutive (require both many hours AND high entropy)
	if (
		daysWithUniformDistribution.length >=
		CONFIG.CONSECUTIVE_INHUMAN_DAYS_EXTREME
	) {
		daysWithUniformDistribution.sort();
		let consecutiveCount = 1;
		let maxConsecutive = 1;
		for (let i = 1; i < daysWithUniformDistribution.length; i++) {
			const prev = toTime(daysWithUniformDistribution[i - 1]);
			const curr = toTime(daysWithUniformDistribution[i]);
			const diffDays = daysBetween(prev, curr);

			if (diffDays === 1) {
				consecutiveCount++;
				maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
			} else {
				consecutiveCount = 1;
			}
		}

		// Consecutive marathon days = sustained uniform activity across many hours
		if (maxConsecutive >= CONFIG.CONSECUTIVE_INHUMAN_DAYS_EXTREME) {
			const uniformDayEvents = codingEventsWithReviews.filter(
				(e) =>
					e.at &&
					daysWithUniformDistribution.includes(localDay(e.at, tzOffsetHours)),
			);

			flags.push({
				id: "coding-streak",
				points: CONFIG.POINTS_NONSTOP_ACTIVITY,
				group: "timing",
				amplifiable: true,
				facts: {
					streakDays: maxConsecutive,
					uniformDays: daysWithUniformDistribution.length,
				},
				events: uniformDayEvents,
			});
		} else if (
			daysWithUniformDistribution.length >= CONFIG.FREQUENT_MARATHON_DAYS
		) {
			const uniformDayEvents = codingEventsWithReviews.filter(
				(e) =>
					e.at &&
					daysWithUniformDistribution.includes(localDay(e.at, tzOffsetHours)),
			);

			flags.push({
				id: "coding-marathons",
				points: CONFIG.POINTS_FREQUENT_MARATHON,
				group: "timing",
				amplifiable: true,
				facts: { uniformDays: daysWithUniformDistribution.length },
				events: uniformDayEvents,
			});
		}
	}

	// External repo spread
	// Only count repos the user doesn't own
	// Only flag for young accounts - established OSS devs often contribute widely
	const externalRepos = new Set(
		events
			.map((e) => e.repo)
			.filter((name) => {
				if (!name) {
					return false;
				}

				const repoOwner = ownerOf(name).toLowerCase();

				return repoOwner !== userLogin;
			}),
	);

	const externalEvents = events.filter((e) => {
		const repoOwner = ownerOf(e.repo).toLowerCase();

		return repoOwner && repoOwner !== userLogin;
	});

	if (externalRepos.size >= CONFIG.REPO_SPREAD_EXTREME) {
		flags.push({
			id: "repo-spread-extreme",
			points: CONFIG.POINTS_EXTREME_REPO_SPREAD_YOUNG,
			group: "repo-spread",
			amplifiable: true,
			facts: {
				repos: externalRepos.size,
				externalEvents: externalEvents.length,
			},
			events: externalEvents,
		});
	} else if (externalRepos.size >= CONFIG.REPO_SPREAD_HIGH) {
		flags.push({
			id: "repo-spread-high",
			points: CONFIG.POINTS_WIDE_REPO_SPREAD_YOUNG,
			group: "repo-spread",
			amplifiable: true,
			facts: {
				repos: externalRepos.size,
				externalEvents: externalEvents.length,
			},
			events: externalEvents,
		});
	}

	// External PRs
	// check frequency, not just total
	const externalPRs = prEvents.filter((e) => {
		const repoOwner = ownerOf(e.repo).toLowerCase();

		return repoOwner && repoOwner !== userLogin;
	});

	// The busiest stretches anywhere in the data, not the ones ending today
	const prDayWindow = densestEventWindow(externalPRs, 24);
	const prWeekWindow = densestEventWindow(externalPRs, 24 * 7);

	// Many PRs in a single day
	// only flag extreme cases
	if (prDayWindow.count >= CONFIG.PRS_TODAY_EXTREME) {
		flags.push({
			id: "external-pr-day",
			points: CONFIG.POINTS_PR_BURST,
			group: "pr-volume",
			amplifiable: true,
			facts: { prs: prDayWindow.count },
			events: prDayWindow.items,
		});
	} else if (prWeekWindow.count >= CONFIG.PRS_WEEK_HIGH) {
		// Many PRs in a week
		flags.push({
			id: "external-pr-week",
			points: CONFIG.POINTS_HIGH_PR_FREQUENCY,
			group: "pr-volume",
			amplifiable: true,
			facts: { prs: prWeekWindow.count },
			events: prWeekWindow.items,
		});
	}

	// Also flag if lots of PRs AND few personal repos (regardless of time)
	if (
		externalPRs.length >= CONFIG.EXTERNAL_PRS_MIN &&
		reposCount < CONFIG.PERSONAL_REPOS_LOW
	) {
		flags.push({
			id: "external-contributor",
			points: CONFIG.POINTS_PR_ONLY_CONTRIBUTOR,
			group: "external-focus",
			amplifiable: true,
			facts: { externalPRs: externalPRs.length, ownRepos: reposCount },
			events: externalPRs,
		});
	}

	// Mostly external activity (not 100%)
	const foreignEvents = events.filter((e) => {
		const repoOwner = ownerOf(e.repo).toLowerCase();

		return repoOwner && repoOwner !== userLogin;
	});
	const foreignRatio = foreignEvents.length / events.length;
	if (
		foreignEvents.length > 0 &&
		foreignRatio >= CONFIG.FOREIGN_RATIO_HIGH &&
		reposCount < CONFIG.PERSONAL_REPOS_LOW
	) {
		flags.push({
			id: "mostly-external",
			points: CONFIG.POINTS_EXTERNAL_FOCUS,
			group: "external-focus",
			amplifiable: true,
			facts: {
				ratio: foreignRatio,
				externalEvents: foreignEvents.length,
				totalEvents: events.length,
				ownRepos: reposCount,
			},
			events: foreignEvents,
		});
	}

	// Young accounts contributing externally but with no engagement events (issues, comments,
	// reviews, watches) show a contribution-only pattern uncommon in organic participation
	const ENGAGEMENT_TYPES = new Set([
		"issue",
		"issue-comment",
		"star",
		"review",
		"review-comment",
		"commit-comment",
	]);

	const hasAnyEngagement = events.some(
		(e) => e.type && ENGAGEMENT_TYPES.has(e.type),
	);

	if (!hasAnyEngagement && externalPRs.length >= 1) {
		flags.push({
			id: "limited-engagement",
			points: CONFIG.POINTS_LIMITED_ENGAGEMENT,
			group: "engagement",
			amplifiable: true,
			facts: { externalPRs: externalPRs.length },
			events: externalPRs,
		});
	}

	return flags;
}
