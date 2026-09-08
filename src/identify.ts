import dayjs from "dayjs";
import minMax from "dayjs/plugin/minMax";
import utc from "dayjs/plugin/utc";
import { calculateConfidence } from "./confidence.ts";
import { CONFIG } from "./config.ts";
import { detectAccountAge } from "./detectors/account-age.ts";
import { detectInhumanActivityPattern } from "./detectors/activity-pattern.ts";
import { detectAIAgentBranchPrefix } from "./detectors/ai-branch-prefix.ts";
import { detectBountyLabelInfrastructure } from "./detectors/bounty-label-infra.ts";
import {
	detectBountyRepoPRs,
	hasBountyRepoEngagement,
} from "./detectors/bounty-repo-activity.ts";
import { detectBranchPRAutomation } from "./detectors/branch-pr-automation.ts";
import { detectClosedPRSpam } from "./detectors/closed-pr-spam.ts";
import { detectCommentBeforePR } from "./detectors/comment-before-pr.ts";
import { detectCommentSpam } from "./detectors/comment-spam.ts";
import { detectDormancy } from "./detectors/dormancy.ts";
import { detectNarrowActivityFocus } from "./detectors/event-diversity.ts";
import {
	detectForkActivity,
	detectForkCombinedActivity,
} from "./detectors/fork-activity.ts";
import { detectExtremeAndDistributedPRSpam } from "./detectors/pr-spam.ts";
import { detectPushBurst } from "./detectors/push-burst.ts";
import { detectRapidPRSpam } from "./detectors/rapid-pr-spam.ts";
import { detectRepositoryCreationBurst } from "./detectors/repository-creation.ts";
import { detectWatchActivity } from "./detectors/watch-activity.ts";
import { detectYoungAccountActivity } from "./detectors/young-account.ts";
import { detectZeroReposActivity } from "./detectors/zero-repos.ts";
import { isGitHubAppAccount } from "./github-app.ts";
import {
	analyzeCommitMetadata,
	getAiMultiplier,
} from "./modifiers/analyze-commit-metadata.ts";
import { getBountyMultiplier } from "./modifiers/bounty-multiplier.ts";
import { detectOrganicSignals } from "./modifiers/organic-signals.ts";
import { scoreFlags } from "./scoring.ts";
import { estimateUtcOffset } from "./timezone.ts";
import type {
	IdentifyFlag,
	IdentifyOptions,
	IdentifyResult,
	IdentityClassification,
} from "./types.ts";
import { analyzeWindow } from "./window.ts";

dayjs.extend(minMax);
dayjs.extend(utc);

export function identify({
	user,
	events,
	excludeRepos = [],
	commits = [],
}: IdentifyOptions): IdentifyResult {
	const flags: IdentifyFlag[] = [];

	const accountName = user.login;
	const reposCount = user.public_repos;

	const excludeReposLower = excludeRepos.map((r) => r.toLowerCase());
	const filteredEvents = events.filter((e) => {
		const repoName = e.repo?.name?.toLowerCase();
		return repoName && !excludeReposLower.includes(repoName);
	});

	const accountAge = dayjs().diff(user.created_at, "days");

	const window = analyzeWindow(filteredEvents);
	const timezone = estimateUtcOffset(filteredEvents);
	const tzOffset = timezone.offsetHours;

	const foreignEvents = filteredEvents.filter((e) => {
		const repoOwner = e.repo?.name?.split("/")[0]?.toLowerCase();
		return repoOwner && repoOwner !== accountName.toLowerCase();
	});

	const isNewOrYoungAccount = accountAge < CONFIG.AGE_YOUNG_ACCOUNT;

	const dormancy = detectDormancy(
		filteredEvents,
		accountAge,
		reposCount,
		window,
	);

	// Some checks are softer on old accounts. To get that, an account needs a
	// history that matches its age, not just an old creation date.
	const isEstablished =
		accountAge >= CONFIG.AGE_ESTABLISHED_ACCOUNT &&
		!dormancy.isDormantReactivation;

	flags.push(...detectAccountAge(accountAge));
	flags.push(...dormancy.flags);
	flags.push(
		...detectZeroReposActivity(reposCount, foreignEvents, filteredEvents),
	);
	flags.push(...detectRepositoryCreationBurst(filteredEvents));
	flags.push(...detectInhumanActivityPattern(filteredEvents));
	flags.push(...detectNarrowActivityFocus(filteredEvents));
	flags.push(...detectCommentSpam(filteredEvents));
	flags.push(...detectWatchActivity(filteredEvents));
	flags.push(
		...detectBranchPRAutomation(filteredEvents, isEstablished, accountName),
	);
	flags.push(...detectRapidPRSpam(filteredEvents, isEstablished));
	flags.push(
		...detectClosedPRSpam(filteredEvents, isEstablished, accountName, tzOffset),
	);
	flags.push(...detectForkActivity(filteredEvents, tzOffset));
	flags.push(...detectForkCombinedActivity(filteredEvents));
	flags.push(
		...detectYoungAccountActivity(
			filteredEvents,
			reposCount,
			isNewOrYoungAccount,
			accountName,
			tzOffset,
		),
	);
	flags.push(...detectPushBurst(filteredEvents));
	flags.push(...detectExtremeAndDistributedPRSpam(filteredEvents));
	flags.push(...detectCommentBeforePR(filteredEvents));
	flags.push(...detectBountyRepoPRs(filteredEvents));
	flags.push(...detectBountyLabelInfrastructure(filteredEvents));
	flags.push(...detectAIAgentBranchPrefix(filteredEvents));
	const isBountyHunter = hasBountyRepoEngagement(filteredEvents);
	const isGitHubApp = isGitHubAppAccount(user, events);

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
			? `${aiCommits}/${totalCommits} commits (${pct}%) are credited to an AI tool, so a ${aiMultiplier}x multiplier applied to automation signals`
			: `${aiCommits}/${totalCommits} commits (${pct}%) are credited to an AI tool, but there are no automation signals to amplify`;

		flags.push({
			label: "Predominantly AI-attributed commits",
			points: 0,
			group: "ai-attribution",
			detail,
			data: [
				{ label: "AI-attributed commits", value: commitMetadata.aiCommits },
				{ label: "Total commits", value: commitMetadata.totalCommits },
				{
					label: "AI commit ratio",
					value: `${Math.round(commitMetadata.ratio * 100)}%`,
				},
				{ label: "Score multiplier", value: aiMultiplier },
			],
			events: [],
		});
	}

	// Invert score: 100 = human, 0 = bot
	const bountyMultiplier = getBountyMultiplier(filteredEvents) ?? 1;
	const scored = scoreFlags(flags, { aiMultiplier, bountyMultiplier });

	const humanScore = Math.min(
		100,
		Math.max(0, 100 - scored.total + organicBonus),
	);

	const confidence = calculateConfidence(window);

	let classification: IdentityClassification = "automation";
	if (humanScore >= CONFIG.THRESHOLD_HUMAN) {
		classification = "organic";
	} else if (humanScore >= CONFIG.THRESHOLD_SUSPICIOUS) {
		classification = "mixed";
	}

	// Too little activity is not proof that an account is fine.
	// But if an account still triggers automation checks with
	// only a few events, that result stands.
	const hasInsufficientEvidence =
		window.eventCount < CONFIG.MIN_EVENTS_FOR_CLASSIFICATION ||
		confidence < CONFIG.CONFIDENCE_MIN_FOR_RESULT;

	if (hasInsufficientEvidence && classification === "organic") {
		classification = "insufficient-data";
	}

	return {
		score: humanScore,
		classification,
		confidence,
		isBountyHunter,
		isGitHubApp,
		flags: scored.flags,
		groups: scored.groups,
		window,
		timezone,
		profile: {
			age: accountAge,
			repos: reposCount,
		},
	};
}
