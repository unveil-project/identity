import dayjs from "dayjs";
import minMax from "dayjs/plugin/minMax";
import { CONFIG } from "../config";
import type { GitHubEvent, IdentifyFlag } from "../types";
import { calculateNormalizedShannonsEntropy } from "../utils";

dayjs.extend(minMax);

export function detectYoungAccountActivity(
	events: GitHubEvent[],
	reposCount: number,
	isNewOrYoungAccount: boolean,
	accountName: string,
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	if (!isNewOrYoungAccount || events.length < CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		return flags;
	}

	const userLogin = accountName.toLowerCase();

	// Commit burst analysis
	const commitEvents = events.filter((e) => e.type === "PushEvent");

	if (commitEvents.length >= CONFIG.MIN_EVENTS_FOR_ANALYSIS) {
		const timestamps = commitEvents
			.map((e) => dayjs(e.created_at))
			.sort((a, b) => a.valueOf() - b.valueOf());

		// Analyze event temporal distribution - detect burst patterns
		let maxCommitsInHour = 0;
		let windowStartIndex = 0;

		for (
			let windowEndIndex = 0;
			windowEndIndex < timestamps.length;
			windowEndIndex++
		) {
			const windowEnd = timestamps[windowEndIndex];

			// Slide window start forward until within 1 hour
			while (
				windowEnd &&
				windowEnd.diff(timestamps[windowStartIndex], "hour", true) > 1
			) {
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
				const diffSeconds = timestamps[i].diff(timestamps[i - 1], "second");

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

	const codingEventsByDay = new Map<string, Date[]>();
	codingEventsWithReviews.forEach((e) => {
		if (!e.created_at) {
			return;
		}

		const t = new Date(e.created_at);
		const day = t.toISOString().slice(0, 10);
		if (!codingEventsByDay.has(day)) codingEventsByDay.set(day, []);
		codingEventsByDay.get(day)?.push(t);
	});

	// For each day, analyze hour distribution using entropy
	// Very high entropy (uniform spread) across many hours = unusual activity pattern
	const daysWithUniformDistribution: string[] = [];
	codingEventsByDay.forEach((dayTimestamps, day) => {
		const hourMap = new Map<number, number>();
		dayTimestamps.forEach((t) => {
			const hour = t.getUTCHours();
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
			flags.push({
				label: "Extended daily coding",
				points: CONFIG.POINTS_NONSTOP_ACTIVITY,
				detail: `${maxConsecutive} days in a row with ${CONFIG.HOURS_PER_DAY_INHUMAN}+ hours of coding`,
			});
		} else if (
			daysWithUniformDistribution.length >= CONFIG.FREQUENT_MARATHON_DAYS
		) {
			flags.push({
				label: "Frequent long coding days",
				points: CONFIG.POINTS_FREQUENT_MARATHON,
				detail: `${daysWithUniformDistribution.length} days with ${CONFIG.HOURS_PER_DAY_INHUMAN}+ hours of coding and uniform hourly distribution`,
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

	const prsThisWeek = externalPRs.filter((e) =>
		dayjs(e.created_at).isAfter(oneWeekAgo),
	);
	const prsToday = externalPRs.filter((e) =>
		dayjs(e.created_at).isAfter(oneDayAgo),
	);

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
			detail,
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
			detail: `${Math.round(foreignRatio * 100)}% of activity on other people's repos`,
		});
	}

	return flags;
}
