import dayjs from "dayjs";
import minMax from "dayjs/plugin/minMax";
import utc from "dayjs/plugin/utc";
import { CONFIG } from "./config";
import { detectAccountAge } from "./detectors/account-age";
import { detectInhumanActivityPattern } from "./detectors/activity-pattern";
import {
	detectBountyRepoPRs,
	hasBountyRepoEngagement,
} from "./detectors/bounty-repo-activity";
import { detectBranchPRAutomation } from "./detectors/branch-pr-automation";
import { detectClosedPRSpam } from "./detectors/closed-pr-spam";
import { detectCommentBeforePR } from "./detectors/comment-before-pr";
import { detectCommentSpam } from "./detectors/comment-spam";
import { detectNarrowActivityFocus } from "./detectors/event-diversity";
import {
	detectForkActivity,
	detectForkCombinedActivity,
} from "./detectors/fork-activity";
import { detectExtremeAndDistributedPRSpam } from "./detectors/pr-spam";
import { detectPushBurst } from "./detectors/push-burst";
import { detectRapidPRSpam } from "./detectors/rapid-pr-spam";
import { detectRepositoryCreationBurst } from "./detectors/repository-creation";
import { detectWatchActivity } from "./detectors/watch-activity";
import { detectYoungAccountActivity } from "./detectors/young-account";
import { detectZeroReposActivity } from "./detectors/zero-repos";
import {
	analyzeCommitMetadata,
	getAiMultiplier,
} from "./modifiers/analyze-commit-metadata";
import { getBountyMultiplier } from "./modifiers/bounty-multiplier";
import { detectOrganicSignals } from "./modifiers/organic-signals";
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

	flags.push(...detectAccountAge(accountAge));
	flags.push(
		...detectZeroReposActivity(reposCount, foreignEvents, filteredEvents),
	);
	flags.push(...detectRepositoryCreationBurst(filteredEvents));
	flags.push(...detectInhumanActivityPattern(filteredEvents));
	flags.push(...detectNarrowActivityFocus(filteredEvents));
	flags.push(...detectCommentSpam(filteredEvents));
	flags.push(...detectWatchActivity(filteredEvents));
	flags.push(...detectBranchPRAutomation(filteredEvents, accountAge));
	flags.push(...detectRapidPRSpam(filteredEvents, accountAge));
	flags.push(...detectClosedPRSpam(filteredEvents, accountAge, accountName));
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
	flags.push(...detectPushBurst(filteredEvents));
	flags.push(...detectExtremeAndDistributedPRSpam(filteredEvents));
	flags.push(...detectCommentBeforePR(filteredEvents));
	flags.push(...detectBountyRepoPRs(filteredEvents));
	const isBountyHunter = hasBountyRepoEngagement(filteredEvents);

	const organicBonus = detectOrganicSignals(filteredEvents, accountName);

	const filteredCommits = commits.filter(
		(commit) =>
			!commit.repo || !excludeReposLower.includes(commit.repo.toLowerCase()),
	);

	const commitMetadata = analyzeCommitMetadata(filteredCommits);
	const aiMultiplier = getAiMultiplier(commitMetadata) ?? 1;

	const hasAmplifiable = flags.some((f) => f.amplifiable && f.points > 0);

	if (aiMultiplier > 1) {
		const { ratio, aiCommits, totalCommits } = commitMetadata;
		const pct = Math.round(ratio * 100);
		const detail = hasAmplifiable
			? `${aiCommits}/${totalCommits} commits (${pct}%) AI-attributed — ${aiMultiplier}x multiplier applied to automation signals`
			: `${aiCommits}/${totalCommits} commits (${pct}%) AI-attributed — no automation signals to amplify`;

		flags.push({
			label: "Predominantly AI-attributed commits",
			points: 0,
			detail,
		});
	}

	// Invert score: 100 = human, 0 = bot
	const bountyMultiplier = getBountyMultiplier(filteredEvents) ?? 1;
	const score = flags.reduce((total, flag) => {
		const effective = flag.amplifiable
			? Math.round(flag.points * aiMultiplier * bountyMultiplier)
			: flag.points;
		return total + effective;
	}, 0);

	const humanScore = Math.min(100, Math.max(0, 100 - score + organicBonus));

	let classification: IdentityClassification = "automation";
	if (humanScore >= CONFIG.THRESHOLD_HUMAN) {
		classification = "organic";
	} else if (humanScore >= CONFIG.THRESHOLD_SUSPICIOUS) {
		classification = "mixed";
	}

	return {
		score: humanScore,
		classification,
		isBountyHunter,
		flags,
		profile: {
			age: accountAge,
			repos: reposCount,
		},
	};
}
