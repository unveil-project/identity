import dayjs from "dayjs";
import minMax from "dayjs/plugin/minMax";
import utc from "dayjs/plugin/utc";
import { CONFIG } from "../config";
import { localDay, localHour } from "../timezone";
import type { GitHubEvent, IdentifyFlag } from "../types";
import {
	calculateNormalizedShannonsEntropy,
	densestEventWindow,
} from "../utils";

dayjs.extend(minMax);
dayjs.extend(utc);

export function detectYoungAccountActivity(
	events: GitHubEvent[],
	reposCount: number,
	isNewOrYoungAccount: boolean,
	accountName: string,
	tzOffsetHours = 0,
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	if (!isNewOrYoungAccount || events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return flags;
	}

	const userLogin = accountName.toLowerCase();

	// PRs (flag more aggressively)
	const prEvents = events.filter(
		(e) => e.type === "PullRequestEvent" && e.payload?.action === "opened",
	);

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
					group: "pr-volume",
					amplifiable: true,
					detail: `${prEvents.length} PRs in ${eventSpanDays} day${eventSpanDays === 1 ? "" : "s"}`,
					data: [
						{ label: "PRs opened", value: prEvents.length },
						{ label: "Over (days)", value: eventSpanDays },
						{
							label: "PRs per day",
							value: parseFloat(prsPerDay.toFixed(1)),
							threshold: CONFIG.ACTIVITY_DENSITY_EXTREME / 2,
						},
					],
					events: prEvents,
				});
			} else if (prsPerDay >= CONFIG.ACTIVITY_DENSITY_HIGH / 2) {
				flags.push({
					label: "High PR volume",
					points: CONFIG.POINTS_HIGH_ACTIVITY_DENSITY + 5,
					group: "pr-volume",
					amplifiable: true,
					detail: `${prEvents.length} PRs in ${eventSpanDays} day${eventSpanDays === 1 ? "" : "s"}`,
					data: [
						{ label: "PRs opened", value: prEvents.length },
						{ label: "Over (days)", value: eventSpanDays },
						{
							label: "PRs per day",
							value: parseFloat(prsPerDay.toFixed(1)),
							threshold: CONFIG.ACTIVITY_DENSITY_HIGH / 2,
						},
					],
					events: prEvents,
				});
			}
		}
	}

	// Unusual daily coding activity detection using Shannon's entropy
	// Automated accounts: uniform hour distribution (high entropy) across many hours
	// Organic accounts: concentrated in certain hours (low entropy/predictable patterns)
	const codingEventTypes = new Set(["PushEvent", "PullRequestEvent"]);
	const codingEventsWithReviews = events.filter(
		(e) =>
			(e.type && codingEventTypes.has(e.type)) ||
			e.type === "PullRequestReviewEvent" ||
			e.type === "PullRequestReviewCommentEvent",
	);

	// Group by day and hour in the account's own local time
	const codingEventsByDay = new Map<string, number[]>();
	codingEventsWithReviews.forEach((e) => {
		if (!e.created_at) {
			return;
		}

		const day = localDay(e.created_at, tzOffsetHours);
		if (!codingEventsByDay.has(day)) codingEventsByDay.set(day, []);
		codingEventsByDay.get(day)?.push(localHour(e.created_at, tzOffsetHours));
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

		// Consecutive marathon days = sustained uniform activity across many hours
		if (maxConsecutive >= CONFIG.CONSECUTIVE_INHUMAN_DAYS_EXTREME) {
			const uniformDayEvents = codingEventsWithReviews.filter(
				(e) =>
					e.created_at &&
					daysWithUniformDistribution.includes(
						localDay(e.created_at, tzOffsetHours),
					),
			);
			flags.push({
				label: "Extended daily coding",
				points: CONFIG.POINTS_NONSTOP_ACTIVITY,
				group: "timing",
				amplifiable: true,
				detail: `${maxConsecutive} days in a row with ${CONFIG.HOURS_PER_DAY_INHUMAN}+ hours of coding`,
				data: [
					{
						label: "Consecutive inhuman days",
						value: maxConsecutive,
						threshold: CONFIG.CONSECUTIVE_INHUMAN_DAYS_EXTREME,
					},
					{ label: "Hours/day threshold", value: CONFIG.HOURS_PER_DAY_INHUMAN },
					{
						label: "Total uniform days",
						value: daysWithUniformDistribution.length,
					},
				],
				events: uniformDayEvents,
			});
		} else if (
			daysWithUniformDistribution.length >= CONFIG.FREQUENT_MARATHON_DAYS
		) {
			const uniformDayEvents = codingEventsWithReviews.filter(
				(e) =>
					e.created_at &&
					daysWithUniformDistribution.includes(
						localDay(e.created_at, tzOffsetHours),
					),
			);
			flags.push({
				label: "Frequent long coding days",
				points: CONFIG.POINTS_FREQUENT_MARATHON,
				group: "timing",
				amplifiable: true,
				detail: `${daysWithUniformDistribution.length} days with ${CONFIG.HOURS_PER_DAY_INHUMAN}+ hours of coding and uniform hourly distribution`,
				data: [
					{
						label: "Uniform-distribution days",
						value: daysWithUniformDistribution.length,
						threshold: CONFIG.FREQUENT_MARATHON_DAYS,
					},
					{ label: "Hours/day threshold", value: CONFIG.HOURS_PER_DAY_INHUMAN },
				],
				events: uniformDayEvents,
			});
		}
	}

	// External repo spread
	// Only count repos the user doesn't own
	// Only flag for young accounts - established OSS devs often contribute widely
	const externalRepos = new Set(
		events
			.map((e) => e.repo?.name)
			.filter((name) => {
				if (!name) return false;
				const repoOwner = name.split("/")[0]?.toLowerCase();
				return repoOwner !== userLogin;
			}),
	);

	const externalEvents = events.filter((e) => {
		const repoOwner = e.repo?.name?.split("/")[0]?.toLowerCase();
		return repoOwner && repoOwner !== userLogin;
	});

	if (externalRepos.size >= CONFIG.REPO_SPREAD_EXTREME) {
		flags.push({
			label: "Highly distributed activity",
			points: CONFIG.POINTS_EXTREME_REPO_SPREAD_YOUNG,
			group: "repo-spread",
			amplifiable: true,
			detail: `Activity spread across ${externalRepos.size} external repositories`,
			data: [
				{
					label: "Distinct external repos",
					value: externalRepos.size,
					threshold: CONFIG.REPO_SPREAD_EXTREME,
				},
				{ label: "External events", value: externalEvents.length },
			],
			events: externalEvents,
		});
	} else if (externalRepos.size >= CONFIG.REPO_SPREAD_HIGH) {
		flags.push({
			label: "Distributed activity",
			points: CONFIG.POINTS_WIDE_REPO_SPREAD_YOUNG,
			group: "repo-spread",
			amplifiable: true,
			detail: `Activity spread across ${externalRepos.size} external repositories`,
			data: [
				{
					label: "Distinct external repos",
					value: externalRepos.size,
					threshold: CONFIG.REPO_SPREAD_HIGH,
				},
				{ label: "External events", value: externalEvents.length },
			],
			events: externalEvents,
		});
	}

	// External PRs
	// check frequency, not just total
	const externalPRs = prEvents.filter((e) => {
		const repoOwner = e.repo?.name?.split("/")[0]?.toLowerCase();
		return repoOwner && repoOwner !== userLogin;
	});

	// The busiest stretches anywhere in the data, not the ones ending today
	const prDayWindow = densestEventWindow(externalPRs, 24);
	const prWeekWindow = densestEventWindow(externalPRs, 24 * 7);

	// Many PRs in a single day
	// only flag extreme cases
	if (prDayWindow.count >= CONFIG.PRS_TODAY_EXTREME) {
		flags.push({
			label: "High PR volume in a 24-hour window",
			points: CONFIG.POINTS_PR_BURST,
			group: "pr-volume",
			amplifiable: true,
			detail: `${prDayWindow.count} PRs to other repos within a single 24-hour window`,
			data: [
				{
					label: "PRs in densest 24h window",
					value: prDayWindow.count,
					threshold: CONFIG.PRS_TODAY_EXTREME,
				},
			],
			events: prDayWindow.items,
		});
	} else if (prWeekWindow.count >= CONFIG.PRS_WEEK_HIGH) {
		// Many PRs in a week
		flags.push({
			label: "High PR volume in a 7-day window",
			points: CONFIG.POINTS_HIGH_PR_FREQUENCY,
			group: "pr-volume",
			amplifiable: true,
			detail: `${prWeekWindow.count} PRs to other repos within a single 7-day window`,
			data: [
				{
					label: "PRs in densest 7-day window",
					value: prWeekWindow.count,
					threshold: CONFIG.PRS_WEEK_HIGH,
				},
			],
			events: prWeekWindow.items,
		});
	}

	// Also flag if lots of PRs AND few personal repos (regardless of time)
	if (
		externalPRs.length >= CONFIG.EXTERNAL_PRS_MIN &&
		reposCount < CONFIG.PERSONAL_REPOS_LOW
	) {
		let detail = `${externalPRs.length} PRs to other repos, but only ${reposCount} of their own`;
		if (reposCount === 0) {
			detail = `${externalPRs.length} PRs to other repos, none of their own`;
		}

		flags.push({
			label: "Primarily external contributions",
			points: CONFIG.POINTS_PR_ONLY_CONTRIBUTOR,
			group: "external-focus",
			amplifiable: true,
			detail,
			data: [
				{
					label: "PRs to external repos",
					value: externalPRs.length,
					threshold: CONFIG.EXTERNAL_PRS_MIN,
				},
				{
					label: "Own repos",
					value: reposCount,
					threshold: CONFIG.PERSONAL_REPOS_LOW,
				},
			],
			events: externalPRs,
		});
	}

	// Mostly external activity (not 100%)
	const foreignEvents = events.filter((e) => {
		const repoOwner = e.repo?.name?.split("/")[0]?.toLowerCase();
		return repoOwner && repoOwner !== userLogin;
	});
	const foreignRatio = foreignEvents.length / events.length;
	if (
		foreignEvents.length > 0 &&
		foreignRatio >= CONFIG.FOREIGN_RATIO_HIGH &&
		reposCount < CONFIG.PERSONAL_REPOS_LOW
	) {
		flags.push({
			label: "Mostly external activity",
			points: CONFIG.POINTS_EXTERNAL_FOCUS,
			group: "external-focus",
			amplifiable: true,
			detail: `${Math.round(foreignRatio * 100)}% of activity on other people's repos`,
			data: [
				{
					label: "External activity ratio",
					value: `${Math.round(foreignRatio * 100)}%`,
					threshold: `${Math.round(CONFIG.FOREIGN_RATIO_HIGH * 100)}%`,
				},
				{ label: "External events", value: foreignEvents.length },
				{ label: "Total events", value: events.length },
				{ label: "Own repos", value: reposCount },
			],
			events: foreignEvents,
		});
	}

	// Young accounts contributing externally but with no engagement events (issues, comments,
	// reviews, watches) show a contribution-only pattern uncommon in organic participation
	const ENGAGEMENT_TYPES = new Set([
		"IssuesEvent",
		"IssueCommentEvent",
		"WatchEvent",
		"PullRequestReviewEvent",
		"PullRequestReviewCommentEvent",
		"CommitCommentEvent",
	]);

	const hasAnyEngagement = events.some(
		(e) => e.type && ENGAGEMENT_TYPES.has(e.type),
	);

	if (!hasAnyEngagement && externalPRs.length >= 1) {
		flags.push({
			label: "Limited community engagement",
			points: CONFIG.POINTS_LIMITED_ENGAGEMENT,
			group: "engagement",
			amplifiable: true,
			detail: `Pushes code to other people's repos, but never opens an issue, comments, reviews, or stars anything`,
			data: [
				{ label: "External PRs", value: externalPRs.length },
				{ label: "Has engagement events", value: false },
			],
			events: externalPRs,
		});
	}

	return flags;
}
