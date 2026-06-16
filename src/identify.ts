import dayjs from "dayjs";
import minMax from "dayjs/plugin/minMax";
import utc from "dayjs/plugin/utc";
import { analyzeCommitMetadata } from "./analyze-commit-metadata";
import { CONFIG, KNOWN_BOT_ACCOUNTS, SPAM_SIGNAL_LABELS } from "./config";
import {
	detectAccountAge,
	detectAccountSeniority,
} from "./detectors/account-age";
import { detectInhumanActivityPattern } from "./detectors/activity-pattern";
import { detectBranchPRAutomation } from "./detectors/branch-pr-automation";
import { detectClosedPRSpam } from "./detectors/closed-pr-spam";
import { detectCommentSpam } from "./detectors/comment-spam";
import { detectNarrowActivityFocus } from "./detectors/event-diversity";
import {
	detectForkActivity,
	detectForkCombinedActivity,
} from "./detectors/fork-activity";
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
import { computeActivityRecencyMultiplier } from "./utils";

dayjs.extend(minMax);
dayjs.extend(utc);

function calculateConfidence(
	flags: IdentifyFlag[],
	classification: IdentityClassification,
): number {
	let corroborating: number;
	if (classification === "organic") {
		corroborating = flags.filter((f) => f.points < 0).length;
	} else if (classification === "mixed") {
		const botFlags = flags.filter((f) => f.points > 0).length;
		const humanFlags = flags.filter((f) => f.points < 0).length;
		corroborating = Math.min(botFlags, humanFlags);
	} else {
		corroborating = flags.filter((f) => f.points > 0).length;
	}
	if (corroborating === 0) return 20;
	return Math.min(95, 40 + (corroborating - 1) * 23);
}

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

	const nameLower = accountName.toLowerCase();
	if (
		KNOWN_BOT_ACCOUNTS.has(nameLower) ||
		KNOWN_BOT_ACCOUNTS.has(nameLower.replace(/\[bot\]$/, "")) ||
		nameLower.endsWith("[bot]")
	) {
		return {
			score: 0,
			confidence: 99,
			classification: "legitimate_automation",
			flags: [],
			profile: { age: accountAge, repos: reposCount },
		};
	}

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

	// Mitigating signals
	flags.push(...detectAccountSeniority(accountAge));

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
	const recencyMultiplier = computeActivityRecencyMultiplier(
		filteredEvents,
		CONFIG.TEMPORAL_DECAY_HALF_LIFE_DAYS,
	);
	const score = flags.reduce((total, flag) => {
		let effective = flag.amplifiable
			? Math.round(flag.points * multiplier)
			: flag.points;
		// Decay applies only when effective > 0 — negative-point (mitigating) flags are exempt
		// by that guard alone, so eventBased: false is only meaningful on positive-point flags.
		if (effective > 0 && flag.eventBased !== false) effective = Math.round(effective * recencyMultiplier);
		return total + effective;
	}, 0);

	const humanScore = Math.max(0, Math.min(100, 100 - score));

	let classification: IdentityClassification = "automation";
	if (humanScore >= CONFIG.THRESHOLD_HUMAN) {
		classification = "organic";
	} else if (humanScore >= CONFIG.THRESHOLD_SUSPICIOUS) {
		classification = "mixed";
	} else if (flags.some((f) => SPAM_SIGNAL_LABELS.has(f.label))) {
		classification = "likely_spam";
	}

	const confidence = calculateConfidence(flags, classification);

	return {
		score: humanScore,
		confidence,
		classification,
		flags,
		profile: {
			age: accountAge,
			repos: reposCount,
		},
	};
}
