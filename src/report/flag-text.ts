import { CONFIG } from "../config";
import type { FlagFacts, FlagId } from "../types";
import {
	describeSpikeDays,
	formatShortSpan,
	formatWindowDuration,
	oneDecimal,
	percent,
	plural,
} from "./format";
import type { FlagText } from "./types";

type FlagTextBuilders = {
	[K in FlagId]: (facts: FlagFacts[K]) => FlagText;
};

/**
 * The words for every flag, by flag id. The checks only record numbers, so
 * this is the one place where flags turn into text.
 */
export const FLAG_TEXT: FlagTextBuilders = {
	// Account age
	"new-account": ({ ageDays }) => ({
		label: "Recently created",
		detail: `Account is ${ageDays} days old`,
		data: [
			{
				label: "Account age (days)",
				value: ageDays,
				threshold: CONFIG.AGE_NEW_ACCOUNT,
			},
		],
	}),
	"young-account": ({ ageDays }) => ({
		label: "Young account",
		detail: `Account is ${ageDays} days old`,
		data: [
			{
				label: "Account age (days)",
				value: ageDays,
				threshold: CONFIG.AGE_YOUNG_ACCOUNT,
			},
		],
	}),
	"dormant-reactivation": ({ ageDays, repos, events, spanDays }) => ({
		label: "Activity inconsistent with account age",
		detail: `The account is ${ageDays} days old with ${repos} repositories, but all ${events} events we can see happened in the space of ${spanDays.toFixed(1)} days`,
		data: [
			{
				label: "Account age (days)",
				value: ageDays,
				threshold: CONFIG.DORMANCY_INFERRED_MIN_AGE_DAYS,
			},
			{
				label: "Observed activity span (days)",
				value: oneDecimal(spanDays),
				threshold: CONFIG.DORMANCY_INFERRED_MAX_SPAN_DAYS,
			},
			{
				label: "Public repos",
				value: repos,
				threshold: CONFIG.DORMANCY_INFERRED_MAX_REPOS,
			},
		],
	}),

	// Profile
	"zero-repos-external": ({ externalEvents, totalEvents }) => ({
		label: "Only active on other people's repos",
		detail: `No personal repos, all ${totalEvents} events are on repos they don't own`,
		data: [
			{ label: "Personal repos", value: 0 },
			{ label: "External events", value: externalEvents },
			{ label: "Total events", value: totalEvents },
		],
	}),

	// Repository creation
	"repo-creation-extreme": ({ created, totalCreated }) => ({
		label: "Concentrated repository creation",
		detail: `${created} repositories created in a short timeframe (within 24 hours)`,
		data: [
			{
				label: "Repos created in 24h",
				value: created,
				threshold: CONFIG.CREATE_BURST_EXTREME,
			},
			{ label: "Total repo creations", value: totalCreated },
		],
	}),
	"repo-creation-high": ({ created, totalCreated }) => ({
		label: "Frequent repository creation",
		detail: `${created} repositories created in a short timeframe (within 24 hours)`,
		data: [
			{
				label: "Repos created in 24h",
				value: created,
				threshold: CONFIG.CREATE_BURST_HIGH,
			},
			{ label: "Total repo creations", value: totalCreated },
		],
	}),

	// Timing
	"always-active": ({ windowStart, hoursActive, longestRestHours, events }) => {
		const rest = longestRestHours.toFixed(1);

		return {
			label: "24/7 activity pattern",
			detail: `Active in ${hoursActive} of 24 hours, with the longest break being only ${rest} hours`,
			data: [
				{ label: "Window start", value: windowStart },
				{
					label: "Hours active",
					value: hoursActive,
					threshold: CONFIG.HOURS_ACTIVE_EXTREME,
				},
				{
					label: "Longest rest (hours)",
					value: parseFloat(rest),
					threshold: CONFIG.REST_GAP_MIN_HOURS,
				},
				{ label: "Events in window", value: events },
			],
		};
	},
	"coding-streak": ({ streakDays, uniformDays }) => ({
		label: "Extended daily coding",
		detail: `${streakDays} days in a row with ${CONFIG.HOURS_PER_DAY_INHUMAN}+ hours of coding`,
		data: [
			{
				label: "Consecutive inhuman days",
				value: streakDays,
				threshold: CONFIG.CONSECUTIVE_INHUMAN_DAYS_EXTREME,
			},
			{ label: "Hours/day threshold", value: CONFIG.HOURS_PER_DAY_INHUMAN },
			{ label: "Total uniform days", value: uniformDays },
		],
	}),
	"coding-marathons": ({ uniformDays }) => ({
		label: "Frequent long coding days",
		detail: `${uniformDays} days with ${CONFIG.HOURS_PER_DAY_INHUMAN}+ hours of coding and uniform hourly distribution`,
		data: [
			{
				label: "Uniform-distribution days",
				value: uniformDays,
				threshold: CONFIG.FREQUENT_MARATHON_DAYS,
			},
			{ label: "Hours/day threshold", value: CONFIG.HOURS_PER_DAY_INHUMAN },
		],
	}),
	"push-burst": ({ pairs, pushes }) => ({
		label: "High push frequency",
		detail: `${pairs} consecutive same-repo push pairs within ${Math.round(CONFIG.TIGHT_COMMIT_SECONDS / 60)} min of each other (${pushes} pushes involved)`,
		data: [
			{
				label: "Rapid push pairs",
				value: pairs,
				threshold: CONFIG.TIGHT_COMMIT_THRESHOLD_GLOBAL,
			},
			{ label: "Pushes involved", value: pushes },
			{ label: "Max interval (s)", value: CONFIG.TIGHT_COMMIT_SECONDS },
		],
	}),

	// Diversity
	"narrow-activity": ({ eventTypes, entropy }) => ({
		label: "Narrow activity focus",
		detail: `Only ${eventTypes} kinds of activity, and none of it involves other people`,
		data: [
			{
				label: "Distinct event types",
				value: eventTypes,
				threshold: CONFIG.DIVERSITY_MAX_EVENT_TYPES,
			},
			{
				label: "Activity entropy",
				value: parseFloat(entropy.toFixed(2)),
				threshold: CONFIG.DIVERSITY_MAX_ENTROPY,
			},
			{ label: "Has social interactions", value: false },
			{ label: "Has watch activity", value: false },
		],
	}),

	// Comments
	"issue-comment-spray-extreme": ({ comments, repos, windowMinutes }) => {
		const duration = formatWindowDuration(windowMinutes);

		return {
			label: "Rapid comments across repositories",
			detail: `${comments} comments to ${repos} different repos in ${duration}`,
			data: [
				{ label: "Comments in window", value: comments },
				{
					label: "Distinct repos",
					value: repos,
					threshold: CONFIG.ISSUE_COMMENT_SPRAY_EXTREME,
				},
				{ label: "Window duration", value: duration },
			],
		};
	},
	"issue-comment-spray-high": ({ comments, repos, windowMinutes }) => {
		const duration = formatWindowDuration(windowMinutes);

		return {
			label: "High comment frequency across repos",
			detail: `${comments} comments to ${repos} different repos in ${duration}`,
			data: [
				{ label: "Comments in window", value: comments },
				{
					label: "Distinct repos",
					value: repos,
					threshold: CONFIG.ISSUE_COMMENT_SPRAY_HIGH,
				},
				{ label: "Window duration", value: duration },
			],
		};
	},
	"pr-comment-spray-extreme": ({ comments, prs, windowMinutes }) => {
		const duration = formatWindowDuration(windowMinutes);

		return {
			label: "Rapid PR review comments",
			detail: `${comments} comments on ${prs} different PRs in ${duration}`,
			data: [
				{ label: "Comments in window", value: comments },
				{
					label: "Distinct PRs",
					value: prs,
					threshold: CONFIG.PR_COMMENT_SPRAY_EXTREME,
				},
				{ label: "Window duration", value: duration },
			],
		};
	},
	"pr-comment-spray-high": ({ comments, prs, windowMinutes }) => {
		const duration = formatWindowDuration(windowMinutes);

		return {
			label: "High PR comment frequency",
			detail: `${comments} comments on ${prs} different PRs in ${duration}`,
			data: [
				{ label: "Comments in window", value: comments },
				{
					label: "Distinct PRs",
					value: prs,
					threshold: CONFIG.PR_COMMENT_SPRAY_HIGH,
				},
				{ label: "Window duration", value: duration },
			],
		};
	},
	"comment-pr-fast": ({ repos, fastestSeconds }) => ({
		label: "Issue comment and PR within minutes",
		detail: `Commented on an issue and opened a PR to the same repo within ${CONFIG.COMMENT_BEFORE_PR_VERY_FAST_MINUTES} minutes, in ${repos} repositories (the fastest took ${fastestSeconds}s)`,
		data: [
			{
				label: "Repos with fast comment→PR",
				value: repos,
				threshold: CONFIG.COMMENT_BEFORE_PR_VERY_FAST_MIN_REPOS,
			},
			{ label: "Shortest gap (s)", value: fastestSeconds },
			{
				label: "Window (min)",
				value: CONFIG.COMMENT_BEFORE_PR_VERY_FAST_MINUTES,
			},
		],
	}),

	// Stars
	"star-spray-extreme": ({ repos, windowMinutes, totalStars }) => {
		const duration = formatWindowDuration(windowMinutes);

		return {
			label: "Very high starring rate",
			detail: `${repos} repositories starred within ${duration}`,
			data: [
				{
					label: "Repos starred in window",
					value: repos,
					threshold: CONFIG.WATCH_SPAM_REPOS_EXTREME,
				},
				{ label: "Window duration", value: duration },
				{ label: "Total star events", value: totalStars },
			],
		};
	},
	"star-spray-high": ({ repos, windowMinutes, totalStars }) => {
		const duration = formatWindowDuration(windowMinutes);

		return {
			label: "High starring rate",
			detail: `${repos} repositories starred within ${duration}`,
			data: [
				{
					label: "Repos starred in window",
					value: repos,
					threshold: CONFIG.WATCH_SPAM_REPOS_HIGH,
				},
				{ label: "Window duration", value: duration },
				{ label: "Total star events", value: totalStars },
			],
		};
	},

	// Branches and PRs
	"branch-pr-pattern": ({
		pairs,
		minPairs,
		branches,
		ownBranches,
		ratio,
		minRatio,
		maxGapSeconds,
	}) => ({
		label: "Rapid branch→PR pattern",
		detail: `${pairs} branches in the account's own repositories followed by PRs within ${maxGapSeconds}s, out of ${branches} branches created in total`,
		data: [
			{ label: "Matched branch→PR pairs", value: pairs, threshold: minPairs },
			{ label: "Total branches", value: branches },
			{ label: "Branches in own repos", value: ownBranches },
			{
				label: "Automation ratio",
				value: percent(ratio),
				threshold: percent(minRatio),
			},
			{
				label: "Max time branch→PR (s)",
				value: maxGapSeconds,
				threshold: CONFIG.BRANCH_PR_TIME_WINDOW_SECONDS,
			},
		],
	}),
	"fork-pr-pattern": ({
		pairs,
		minPairs,
		branches,
		ratio,
		minRatio,
		maxGapSeconds,
	}) => ({
		label: "Rapid fork→PR pattern",
		detail: `${pairs} fork branches followed by upstream PRs within ${maxGapSeconds}s, out of ${branches} branches created in total`,
		data: [
			{
				label: "Matched fork branch→PR pairs",
				value: pairs,
				threshold: minPairs,
			},
			{ label: "Total branches", value: branches },
			{
				label: "Automation ratio",
				value: percent(ratio),
				threshold: percent(minRatio),
			},
			{
				label: "Max time branch→PR (s)",
				value: maxGapSeconds,
				threshold: CONFIG.BRANCH_PR_TIME_WINDOW_SECONDS,
			},
		],
	}),
	"rapid-prs": ({ prs, minPRs, repo, maxGapSeconds }) => ({
		label: "Rapid PRs to repository",
		detail: `${prs} PRs opened to ${repo} within ${maxGapSeconds}s intervals`,
		data: [
			{ label: "Rapid PRs to same repo", value: prs, threshold: minPRs },
			{ label: "Target repository", value: repo },
			{
				label: "Max interval between PRs (s)",
				value: maxGapSeconds,
				threshold: CONFIG.BRANCH_PR_TIME_WINDOW_SECONDS,
			},
		],
	}),

	// PR outcome
	"closed-pr-spray": ({
		closed,
		minClosed,
		repos,
		spanDays,
		spanMinutes,
		spikeDays,
		perDay,
	}) => {
		const span = formatShortSpan(spanDays, spanMinutes);

		return {
			label: "Closed PRs across many repositories",
			detail: `${closed} PRs were closed across ${repos} repositories in ${span}${describeSpikeDays(spikeDays)}.`,
			data: [
				{ label: "Closed PRs", value: closed, threshold: minClosed },
				{
					label: "Distinct repos",
					value: repos,
					threshold: CONFIG.CLOSED_PR_REPO_SPREAD,
				},
				{ label: "Time span", value: span },
				{ label: "Density (PRs/day)", value: oneDecimal(perDay) },
			],
		};
	},
	"closed-pr-burst": ({ closed, minClosed, repos, spanMinutes }) => ({
		label: "Concentrated PR closures",
		detail: `${closed} PRs closed across ${repos} repos in ${spanMinutes}m (concentrated closing activity)`,
		data: [
			{ label: "Closed PRs", value: closed, threshold: minClosed },
			{ label: "Distinct repos", value: repos },
			{
				label: "Time span (min)",
				value: spanMinutes,
				threshold: CONFIG.CLOSED_PR_TIME_WINDOW_MINUTES,
			},
		],
	}),

	// Forks
	"fork-extreme": ({ forks, totalForks }) => ({
		label: "Extreme fork automation",
		detail: `${forks} repositories forked in rapid succession (within 24 hours)`,
		data: [
			{
				label: "Forks in 24h window",
				value: forks,
				threshold: CONFIG.FORKS_SURGE_EXTREME_HIGH,
			},
			{ label: "Total forks observed", value: totalForks },
		],
	}),
	"fork-severe": ({ forks, totalForks }) => ({
		label: "Severe fork surge",
		detail: `${forks} repositories forked in rapid succession (within 24 hours)`,
		data: [
			{
				label: "Forks in 24h window",
				value: forks,
				threshold: CONFIG.FORKS_SURGE_SEVERE,
			},
			{ label: "Total forks observed", value: totalForks },
		],
	}),
	"fork-spike": ({ forks, totalForks }) => ({
		label: "Fork spike detected",
		detail: `Burst of ${forks} fork events in a single 24-hour window`,
		data: [
			{
				label: "Forks in 24h window",
				value: forks,
				threshold: CONFIG.FORKS_EXTREME,
			},
			{ label: "Total forks observed", value: totalForks },
		],
	}),
	"fork-multiple": ({ forks, totalForks }) => ({
		label: "Multiple forks",
		detail: `${forks} repositories forked in a single 24-hour window`,
		data: [
			{
				label: "Forks in 24h window",
				value: forks,
				threshold: CONFIG.FORKS_HIGH,
			},
			{ label: "Total forks observed", value: totalForks },
		],
	}),
	"fork-surge-48h": ({ forks, totalForks }) => ({
		label: "Multi-day fork surge",
		detail: `Concentrated burst: ${forks} repositories forked over 2 days`,
		data: [
			{
				label: "Forks in 48h window",
				value: forks,
				threshold: CONFIG.FORKS_SURGE_48H,
			},
			{ label: "Total forks observed", value: totalForks },
		],
	}),
	"fork-surge-72h": ({ forks, totalForks }) => ({
		label: "Severe multi-day fork surge",
		detail: `Rapid burst: ${forks} repositories forked over 72 hours`,
		data: [
			{
				label: "Forks in 72h window",
				value: forks,
				threshold: CONFIG.FORKS_SURGE_72H,
			},
			{ label: "Total forks observed", value: totalForks },
		],
	}),
	"fork-rate": ({ perDay, spanDays, totalForks }) => ({
		label: "Sustained fork rate",
		detail: `Average of ${perDay.toFixed(1)} forks per day over ${spanDays} days (${totalForks} total)`,
		data: [
			{
				label: "Forks per day",
				value: oneDecimal(perDay),
				threshold: CONFIG.FORKS_PER_DAY_HIGH,
			},
			{ label: "Activity span (days)", value: spanDays },
			{ label: "Total forks", value: totalForks },
		],
	}),
	"fork-streak": ({ streakDays, activeDays, totalForks }) => ({
		label: "Extended forking pattern",
		detail: `Forking activity on ${activeDays} days (${streakDays} consecutive), ${totalForks} repositories total`,
		data: [
			{
				label: "Consecutive fork days",
				value: streakDays,
				threshold: CONFIG.CONSECUTIVE_FORK_DAYS,
			},
			{ label: "Total active days", value: activeDays },
			{ label: "Total forks", value: totalForks },
		],
	}),
	"fork-scatter": ({ repos, totalForks, spanDays }) => {
		const span =
			spanDays > 0 ? ` over ${spanDays} days` : " in a short timeframe";

		return {
			label: "Fork scatter pattern",
			detail: `Forks spread across ${repos} different repositories${span}`,
			data: [
				{
					label: "Distinct repos forked",
					value: repos,
					threshold: CONFIG.FORK_REPO_DIVERSITY_HIGH,
				},
				{ label: "Total forks", value: totalForks },
				{ label: "Activity span (days)", value: spanDays },
			],
		};
	},
	"fork-chain": ({ forks, branches, prs }) => {
		const steps = forks + branches + prs;

		return {
			label: "Chained automation pattern",
			detail: `${steps} steps in the same order every time: ${forks} forks, then ${branches} branches, then ${prs} pull requests`,
			data: [
				{ label: "Fork events", value: forks },
				{ label: "Branch creates in forked repos", value: branches },
				{ label: "PRs from forked repos", value: prs },
				{ label: "Total chained operations", value: steps },
			],
		};
	},

	// PR volume
	"young-pr-volume-extreme": ({ prs, spanDays, perDay }) => ({
		label: "Very high PR volume",
		detail: `${prs} PRs in ${plural(spanDays, "day")}`,
		data: [
			{ label: "PRs opened", value: prs },
			{ label: "Over (days)", value: spanDays },
			{
				label: "PRs per day",
				value: oneDecimal(perDay),
				threshold: CONFIG.ACTIVITY_DENSITY_EXTREME / 2,
			},
		],
	}),
	"young-pr-volume-high": ({ prs, spanDays, perDay }) => ({
		label: "High PR volume",
		detail: `${prs} PRs in ${plural(spanDays, "day")}`,
		data: [
			{ label: "PRs opened", value: prs },
			{ label: "Over (days)", value: spanDays },
			{
				label: "PRs per day",
				value: oneDecimal(perDay),
				threshold: CONFIG.ACTIVITY_DENSITY_HIGH / 2,
			},
		],
	}),
	"external-pr-day": ({ prs }) => ({
		label: "High PR volume in a 24-hour window",
		detail: `${prs} PRs to other repos within a single 24-hour window`,
		data: [
			{
				label: "PRs in densest 24h window",
				value: prs,
				threshold: CONFIG.PRS_TODAY_EXTREME,
			},
		],
	}),
	"external-pr-week": ({ prs }) => ({
		label: "High PR volume in a 7-day window",
		detail: `${prs} PRs to other repos within a single 7-day window`,
		data: [
			{
				label: "PRs in densest 7-day window",
				value: prs,
				threshold: CONFIG.PRS_WEEK_HIGH,
			},
		],
	}),
	"pr-volume-day": ({ prs }) => ({
		label: "Very high PR volume (daily)",
		detail: `${prs} PRs within a single 24-hour window`,
		data: [
			{
				label: "PRs in densest 24h window",
				value: prs,
				threshold: CONFIG.PRS_DAY_EXTREME,
			},
		],
	}),
	"pr-volume-week-extreme": ({ prs }) => ({
		label: "Very high PR volume (weekly)",
		detail: `${prs} PRs within a single 7-day window`,
		data: [
			{
				label: "PRs in densest 7-day window",
				value: prs,
				threshold: CONFIG.PRS_WEEK_EXTREME,
			},
		],
	}),
	"pr-volume-week-high": ({ prs }) => ({
		label: "High PR volume (weekly)",
		detail: `${prs} PRs within a single 7-day window`,
		data: [
			{
				label: "PRs in densest 7-day window",
				value: prs,
				threshold: CONFIG.PRS_WEEK_VERY_HIGH,
			},
		],
	}),
	"pr-distributed": ({ prs, repos, perWeek, busiest30Days }) => {
		const rate = perWeek > 0 ? ` (${perWeek.toFixed(1)} PRs/week)` : "";

		return {
			label: "Distributed PR pattern",
			detail: `${prs} PRs spread across ${repos} different repositories${rate}`,
			data: [
				{ label: "Total PRs", value: prs, threshold: CONFIG.PRS_SPAM_VOLUME },
				{
					label: "Distinct repos targeted",
					value: repos,
					threshold: CONFIG.REPOS_SPAM_SPREAD,
				},
				{ label: "PRs per week", value: oneDecimal(perWeek) },
				{ label: "PRs in densest 30-day window", value: busiest30Days },
			],
		};
	},

	// Repo spread
	"repo-spread-extreme": ({ repos, externalEvents }) => ({
		label: "Highly distributed activity",
		detail: `Activity spread across ${repos} external repositories`,
		data: [
			{
				label: "Distinct external repos",
				value: repos,
				threshold: CONFIG.REPO_SPREAD_EXTREME,
			},
			{ label: "External events", value: externalEvents },
		],
	}),
	"repo-spread-high": ({ repos, externalEvents }) => ({
		label: "Distributed activity",
		detail: `Activity spread across ${repos} external repositories`,
		data: [
			{
				label: "Distinct external repos",
				value: repos,
				threshold: CONFIG.REPO_SPREAD_HIGH,
			},
			{ label: "External events", value: externalEvents },
		],
	}),

	// External focus
	"external-contributor": ({ externalPRs, ownRepos }) => {
		const own =
			ownRepos === 0
				? "none of their own"
				: `but only ${ownRepos} of their own`;

		return {
			label: "Primarily external contributions",
			detail: `${externalPRs} PRs to other repos, ${own}`,
			data: [
				{
					label: "PRs to external repos",
					value: externalPRs,
					threshold: CONFIG.EXTERNAL_PRS_MIN,
				},
				{
					label: "Own repos",
					value: ownRepos,
					threshold: CONFIG.PERSONAL_REPOS_LOW,
				},
			],
		};
	},
	"mostly-external": ({ ratio, externalEvents, totalEvents, ownRepos }) => ({
		label: "Mostly external activity",
		detail: `${percent(ratio)} of activity on other people's repos`,
		data: [
			{
				label: "External activity ratio",
				value: percent(ratio),
				threshold: percent(CONFIG.FOREIGN_RATIO_HIGH),
			},
			{ label: "External events", value: externalEvents },
			{ label: "Total events", value: totalEvents },
			{ label: "Own repos", value: ownRepos },
		],
	}),

	// Engagement
	"limited-engagement": ({ externalPRs }) => ({
		label: "Limited community engagement",
		detail:
			"Pushes code to other people's repos, but never opens an issue, comments, reviews, or stars anything",
		data: [
			{ label: "External PRs", value: externalPRs },
			{ label: "Has engagement events", value: false },
		],
	}),

	// Bounty
	"bounty-prs-high": (facts) => ({
		label: "PRs predominantly targeting known bounty program repositories",
		...describeBountyPRs(facts),
	}),
	"bounty-prs-low": (facts) => ({
		label: "PR activity in known bounty program repositories",
		...describeBountyPRs(facts),
	}),
	"bounty-labels": ({ issues, repos }) => ({
		label: "Bounty infrastructure activity",
		detail: `${issues} issues labeled with bounty amounts across ${plural(repos, "known bounty repo")}`,
		data: [
			{
				label: "Bounty-labeled issues",
				value: issues,
				threshold: CONFIG.BOUNTY_LABEL_MIN,
			},
			{ label: "Repos involved", value: repos },
		],
	}),

	// AI attribution
	"ai-branch-prefix": ({ aiBranches, branches, ratio, prefixes }) => ({
		label: "AI agent branch naming pattern",
		detail: `${aiBranches}/${branches} branches use AI agent tool prefixes (${prefixes.join(", ")})`,
		data: [
			{ label: "AI-prefixed branches", value: aiBranches },
			{
				label: "Total branches",
				value: branches,
				threshold: CONFIG.AI_BRANCH_MIN_CREATIONS,
			},
			{
				label: "AI branch ratio",
				value: percent(ratio),
				threshold: percent(CONFIG.AI_BRANCH_RATIO_MIN),
			},
			{ label: "Detected prefixes", value: prefixes.join(", ") },
		],
	}),
};

/** The sentence and metrics shared by both bounty PR flags. */
function describeBountyPRs({
	bountyPRs,
	openedPRs,
	ratio,
	merged,
	closed,
}: FlagFacts["bounty-prs-high"]): Omit<FlagText, "label"> {
	const share = `${bountyPRs} of ${openedPRs} opened PRs (${percent(ratio)}) target known bounty program repositories`;
	const outcome =
		merged + closed > 0
			? `; ${merged} merged, ${closed} closed without merge`
			: "";

	return {
		detail: `${share}${outcome}`,
		data: [
			{ label: "PRs to bounty repos", value: bountyPRs },
			{ label: "Total PRs opened", value: openedPRs },
			{ label: "Bounty PR ratio", value: percent(ratio) },
			{ label: "Merged", value: merged },
			{ label: "Closed without merge", value: closed },
		],
	};
}
