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
import { detectCodingMarathons } from "./detectors/coding-marathons";
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
import { externalEventsOf } from "./events";
import { getBountyMultiplier } from "./modifiers/bounty-multiplier";
import { detectOrganicSignals } from "./modifiers/organic-signals";
import { humanScore, scoreFlags } from "./scoring";
import { daysBetween, toTime } from "./time";
import { estimateUtcOffset } from "./timezone";
import type {
	AccountInput,
	Analysis,
	ClassificationLabel,
	Flag,
	WindowInfo,
} from "./types";
import { analyzeWindow } from "./window";

function classificationFor(
	score: number,
	window: WindowInfo,
	confidence: number,
): ClassificationLabel {
	if (score < CONFIG.THRESHOLD_SUSPICIOUS) {
		return "automation";
	}

	if (score < CONFIG.THRESHOLD_HUMAN) {
		return "mixed";
	}

	// Too little activity is not proof that an account is fine, so a good score
	// needs enough events behind it. A bad score stands even with few events:
	// the checks above found something real.
	const hasEnoughEvidence =
		window.eventCount >= CONFIG.MIN_EVENTS_FOR_CLASSIFICATION &&
		confidence >= CONFIG.CONFIDENCE_MIN_FOR_RESULT;

	if (!hasEnoughEvidence) {
		return "insufficient-data";
	}

	return "organic";
}

/**
 * Run every check on an account and score it. `classify` and `report` both
 * start from this, and each returns the part its caller asked for.
 */
export function analyze<Source = unknown>({
	account,
	events,
	eventCap,
}: AccountInput<Source>): Analysis<Source> {
	const login = account.login;
	const reposCount = account.publicRepos;

	const repoEvents = events.filter((event) => event.repo);
	const externalEvents = externalEventsOf(repoEvents, login);

	const accountAge = Math.trunc(
		daysBetween(toTime(account.createdAt), Date.now()),
	);
	const isYoung = accountAge < CONFIG.AGE_YOUNG_ACCOUNT;

	const window = analyzeWindow(repoEvents, eventCap);
	const timezone = estimateUtcOffset(repoEvents);
	const tzOffset = timezone.offsetHours;

	const dormancy = detectDormancy(repoEvents, accountAge, reposCount, window);

	// Some checks are softer on old accounts. To get that, an account needs a
	// history that matches its age, not just an old creation date.
	const isEstablished =
		accountAge >= CONFIG.AGE_ESTABLISHED_ACCOUNT &&
		!dormancy.isDormantReactivation;

	const flags: Flag[] = [
		...detectAccountAge(accountAge),
		...dormancy.flags,
		...detectZeroReposActivity(reposCount, externalEvents, repoEvents),
		...detectRepositoryCreationBurst(repoEvents),
		...detectInhumanActivityPattern(repoEvents),
		...detectNarrowActivityFocus(repoEvents),
		...detectCommentSpam(repoEvents),
		...detectWatchActivity(repoEvents),
		...detectBranchPRAutomation(repoEvents, isEstablished, login),
		...detectRapidPRSpam(repoEvents, isEstablished),
		...detectClosedPRSpam(repoEvents, isEstablished, tzOffset),
		...detectForkActivity(repoEvents, tzOffset),
		...detectForkCombinedActivity(repoEvents),
		...detectCodingMarathons(repoEvents, tzOffset),
		...detectYoungAccountActivity(repoEvents, reposCount, isYoung, login),
		...detectPushBurst(repoEvents),
		...detectExtremeAndDistributedPRSpam(repoEvents),
		...detectCommentBeforePR(repoEvents, login),
		...detectBountyRepoPRs(repoEvents),
		...detectBountyLabelInfrastructure(repoEvents),
		...detectAIAgentBranchPrefix(repoEvents),
	];

	const scored = scoreFlags(flags, {
		bountyMultiplier: getBountyMultiplier(repoEvents) ?? 1,
	});
	const score = humanScore(scored.total, detectOrganicSignals(repoEvents));
	const confidence = calculateConfidence(window);

	return {
		score,
		classification: classificationFor(score, window, confidence),
		confidence,
		isBountyHunter: hasBountyRepoEngagement(repoEvents),
		isGitHubApp:
			account.isApp === true ||
			events.some((event) => event.actorIsApp === true),
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
