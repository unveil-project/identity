import dayjs from "dayjs";
import minMax from "dayjs/plugin/minMax";
import utc from "dayjs/plugin/utc";
import { analyzeCommitMetadata } from "./analyze-commit-metadata";
import { CONFIG } from "./config";
import {
	detectAccountAge,
	detectAccountSeniority,
} from "./detectors/account-age";
import { detectInhumanActivityPattern } from "./detectors/activity-pattern";
import {
	detectConsumerNoReciprocity,
	detectEventMonoculture,
	detectIssueBurst,
	detectStarConcentration,
	detectThinProfileBot,
} from "./detectors/automation-signals";
import { detectBranchPRAutomation } from "./detectors/branch-pr-automation";
import { detectClosedPRSpam } from "./detectors/closed-pr-spam";
import { detectCommentSpam } from "./detectors/comment-spam";
import { detectNarrowActivityFocus } from "./detectors/event-diversity";
import {
	detectForkActivity,
	detectForkCombinedActivity,
} from "./detectors/fork-activity";
import {
	detectDayOfWeekVariance,
	detectDormancyGap,
	detectFollowerCount,
	detectGistActivity,
	detectIdentityCompleteness,
	detectLongSpanEngagement,
	detectMergedContributions,
	detectPRIterationCycles,
	detectPreAiHistory,
	detectReviewActivity,
	detectReviewCommentActivity,
} from "./detectors/human-signals";
import { detectExtremeAndDistributedPRSpam } from "./detectors/pr-spam";
import { detectRapidPRSpam } from "./detectors/rapid-pr-spam";
import { detectRepositoryCreationBurst } from "./detectors/repository-creation";
import { detectYoungAccountActivity } from "./detectors/young-account";
import { detectZeroReposActivity } from "./detectors/zero-repos";
import type {
	IdentifyFlag,
	IdentifyOptions,
	IdentifyResult,
	IdentityClassification,
} from "./types";

dayjs.extend(minMax);
dayjs.extend(utc);

export function identify({
	createdAt,
	reposCount,
	accountName,
	events,
	excludeRepos = [],
	commits = [],
	repos = [],
	profile,
}: IdentifyOptions): IdentifyResult {
	const flags: IdentifyFlag[] = [];

	const excludeReposLower = excludeRepos.map((r) => r.toLowerCase());
	const filteredEvents = events.filter((e) => {
		const repoName = e.repo?.name?.toLowerCase();
		return repoName && !excludeReposLower.includes(repoName);
	});

	const accountAge = dayjs().diff(createdAt, "days");

	const foreignEvents = filteredEvents.filter((e) => {
		const repoOwner = e.repo?.name?.split("/")[0]?.toLowerCase();
		return repoOwner && repoOwner !== accountName.toLowerCase();
	});

	const isNewOrYoungAccount = accountAge < CONFIG.AGE_YOUNG_ACCOUNT;

	// Bot detection signals
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
	flags.push(...detectClosedPRSpam(filteredEvents, accountAge));
	flags.push(...detectForkActivity(filteredEvents));
	flags.push(...detectForkCombinedActivity(filteredEvents));
	flags.push(
		...detectYoungAccountActivity(
			filteredEvents,
			reposCount,
			isNewOrYoungAccount,
			accountName,
		),
	);
	flags.push(...detectExtremeAndDistributedPRSpam(filteredEvents));
	flags.push(...detectStarConcentration(filteredEvents));
	flags.push(...detectEventMonoculture(filteredEvents));
	flags.push(...detectThinProfileBot(profile, reposCount));
	flags.push(...detectIssueBurst(filteredEvents, accountName));
	flags.push(...detectConsumerNoReciprocity(filteredEvents, accountName));

	// Mitigating signals
	flags.push(...detectAccountSeniority(accountAge));
	flags.push(...detectMergedContributions(filteredEvents, accountName));
	const filteredRepos = repos.filter(
		(r) => !r.name || !excludeReposLower.includes(r.name.toLowerCase()),
	);
	flags.push(...detectPreAiHistory(filteredRepos));
	flags.push(...detectReviewActivity(filteredEvents, accountName));
	flags.push(...detectReviewCommentActivity(filteredEvents, accountName));
	flags.push(...detectFollowerCount(profile));
	flags.push(...detectIdentityCompleteness(profile));
	flags.push(...detectDormancyGap(filteredEvents));
	flags.push(...detectGistActivity(filteredEvents));
	flags.push(...detectPRIterationCycles(filteredEvents, accountName));
	flags.push(...detectLongSpanEngagement(filteredEvents, accountName));
	flags.push(...detectDayOfWeekVariance(filteredEvents));

	const filteredCommits = commits.filter(
		(commit) =>
			!commit.repo || !excludeReposLower.includes(commit.repo.toLowerCase()),
	);

	const commitMetadata = analyzeCommitMetadata(filteredCommits);
	const aiTier =
		commitMetadata.totalCommits >= CONFIG.AI_COMMIT_MIN_COMMITS
			? CONFIG.AI_COMMIT_TIERS.find(
					(tier) => commitMetadata.ratio >= tier.ratio,
				)
			: undefined;

	const hasAmplifiable = flags.some((f) => f.amplifiable && f.points > 0);

	if (aiTier) {
		const { ratio, aiCommits, totalCommits } = commitMetadata;
		const pct = Math.round(ratio * 100);
		const detail = hasAmplifiable
			? `${aiCommits}/${totalCommits} commits (${pct}%) AI-attributed — ${aiTier.multiplier}x multiplier applied to automation signals`
			: `${aiCommits}/${totalCommits} commits (${pct}%) AI-attributed — no automation signals to amplify`;

		flags.push({
			label: "Predominantly AI-attributed commits",
			points: 0,
			detail,
		});
	}

	// Invert score: 100 = human, 0 = bot
	const multiplier = aiTier?.multiplier ?? 1;
	const score = flags.reduce((total, flag) => {
		const effective = flag.amplifiable
			? Math.round(flag.points * multiplier)
			: flag.points;
		return total + effective;
	}, 0);

	const humanScore = Math.max(0, Math.min(100, 100 - score));

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
