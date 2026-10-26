import { calculateConfidence } from "./confidence";
import { CONFIG } from "./config";
import { detectAccountAge } from "./detectors/account-age";
import { detectInhumanActivityPattern } from "./detectors/activity-pattern";
import { detectAIAgentBranchPrefix } from "./detectors/ai-branch-prefix";
import { detectBountyLabelInfrastructure } from "./detectors/bounty-label-infra";
import {
	detectBountyRepoPRs,
	hasBountyRepoEngagement,
} from "./detectors/bounty-repo-activity";
import { detectBranchPRAutomation } from "./detectors/branch-pr-automation";
import { detectClosedPRSpam } from "./detectors/closed-pr-spam";
import { detectCommentBeforePR } from "./detectors/comment-before-pr";
import { detectCommentSpam } from "./detectors/comment-spam";
import { detectDormancy } from "./detectors/dormancy";
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
import { getBountyMultiplier } from "./modifiers/bounty-multiplier";
import { detectOrganicSignals } from "./modifiers/organic-signals";
import { scoreFlags } from "./scoring";
import { daysBetween, toTime } from "./time";
import { estimateUtcOffset } from "./timezone";
import type {
	AccountInput,
	Analysis,
	ClassificationLabel,
	Flag,
} from "./types";
import { ownerOf } from "./utils";
import { analyzeWindow } from "./window";

/**
 * Run every check on an account and score it. `classify` and `report` both
 * start from this, and each returns the part its caller asked for.
 */
export function analyze<Source = unknown>({
	account,
	events,
	eventCap,
}: AccountInput<Source>): Analysis<Source> {
	const flags: Flag[] = [];

	const accountName = account.login;
	const reposCount = account.publicRepos;

	const filteredEvents = events.filter((e) => e.repo);

	const accountAge = Math.trunc(
		daysBetween(toTime(account.createdAt), Date.now()),
	);

	const window = analyzeWindow(filteredEvents, eventCap);
	const timezone = estimateUtcOffset(filteredEvents);
	const tzOffset = timezone.offsetHours;

	const foreignEvents = filteredEvents.filter((e) => {
		const repoOwner = ownerOf(e.repo).toLowerCase();

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
	flags.push(...detectClosedPRSpam(filteredEvents, isEstablished, tzOffset));
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
	const isGitHubApp =
		account.isApp === true || events.some((e) => e.actorIsApp === true);

	const organicBonus = detectOrganicSignals(filteredEvents);

	// Invert score: 100 = human, 0 = bot
	const bountyMultiplier = getBountyMultiplier(filteredEvents) ?? 1;
	const scored = scoreFlags(flags, { bountyMultiplier });

	const humanScore = Math.min(
		100,
		Math.max(0, 100 - scored.total + organicBonus),
	);

	const confidence = calculateConfidence(window);

	let classification: ClassificationLabel = "automation";
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
		// The flags point at the events we were given, so their source type holds.
		flags: scored.flags as Flag<Source>[],
		groups: scored.groups,
		window,
		timezone,
		profile: {
			age: accountAge,
			repos: reposCount,
		},
	};
}
