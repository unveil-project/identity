import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { CONFIG } from "../config";
import type { GitHubEvent, IdentifyFlag, IdentifyProfile } from "../types";
import { calculateNormalizedShannonsEntropy } from "../utils";

dayjs.extend(utc);

export function detectStarConcentration(events: GitHubEvent[]): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];
	if (events.length === 0) return flags;

	const watchEvents = events.filter((e) => e.type === "WatchEvent");
	const pushAndPRCount = events.filter(
		(e) => e.type === "PushEvent" || e.type === "PullRequestEvent",
	).length;

	const watchRatio = watchEvents.length / events.length;
	if (
		watchRatio >= CONFIG.WATCH_CONCENTRATION_RATIO &&
		pushAndPRCount <= CONFIG.WATCH_CONCENTRATION_PUSH_PR_MAX
	) {
		flags.push({
			label: "Star farm pattern",
			points: CONFIG.POINTS_STAR_CONCENTRATION,
			amplifiable: true,
			detail: `${Math.round(watchRatio * 100)}% of activity is starring with ≤${CONFIG.WATCH_CONCENTRATION_PUSH_PR_MAX} push/PR events`,
		});
	}

	// Sliding window: max watches in any 24-hour span
	const windowMs = 24 * 60 * 60 * 1000;
	const watchTs = watchEvents
		.map((e) => e.created_at)
		.filter((t): t is string => !!t)
		.map((t) => dayjs.utc(t).valueOf())
		.sort((a, b) => a - b);

	let left = 0;
	let maxInWindow = 0;
	for (let right = 0; right < watchTs.length; right++) {
		while (watchTs[right] - watchTs[left] > windowMs) left++;
		const count = right - left + 1;
		if (count > maxInWindow) maxInWindow = count;
	}

	if (maxInWindow >= CONFIG.WATCH_CONCENTRATION_BURST_MIN) {
		flags.push({
			label: "Star burst activity",
			points: CONFIG.POINTS_STAR_CONCENTRATION_BURST,
			amplifiable: true,
			detail: `${maxInWindow} stars in a 24-hour window`,
		});
	}

	return flags;
}

export function detectEventMonoculture(events: GitHubEvent[]): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];
	if (events.length < CONFIG.MONOCULTURE_MIN_EVENTS) return flags;

	const typeCounts = new Map<string, number>();
	for (const e of events) {
		if (e.type) typeCounts.set(e.type, (typeCounts.get(e.type) ?? 0) + 1);
	}

	// Single-type interaction accounts (IssueCommentEvent-only bots, etc.) must not be
	// skipped here: detectNarrowActivityFocus exempts interaction-heavy streams, so they
	// would go entirely undetected. Non-interaction single-type accounts are caught by
	// detectNarrowActivityFocus and are correctly excluded to avoid double-flagging.
	const INTERACTION_TYPES = new Set([
		"IssueCommentEvent",
		"PullRequestReviewEvent",
		"PullRequestReviewCommentEvent",
	]);
	if (
		typeCounts.size <= 1 &&
		!INTERACTION_TYPES.has([...typeCounts.keys()][0] ?? "")
	)
		return flags;

	const counts = Array.from(typeCounts.values());
	const entropy = calculateNormalizedShannonsEntropy(counts);

	if (entropy <= CONFIG.MONOCULTURE_MAX_ENTROPY) {
		const [dominantType, dominantCount] = [...typeCounts.entries()].sort(
			(a, b) => b[1] - a[1],
		)[0];
		const pct = Math.round((dominantCount / events.length) * 100);
		flags.push({
			label: "Event type monoculture",
			points: CONFIG.POINTS_MONOCULTURE,
			amplifiable: true,
			detail: `${dominantType} dominates at ${pct}% of activity (entropy: ${entropy.toFixed(2)})`,
		});
	}

	return flags;
}

export function detectThinProfileBot(
	profile: IdentifyProfile | undefined,
	reposCount: number,
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];
	if (!profile) return flags;

	let indicators = 0;
	if (profile.followers <= CONFIG.THIN_PROFILE_FOLLOWERS_MAX) indicators++;
	if (reposCount <= CONFIG.THIN_PROFILE_REPOS_MAX) indicators++;
	if (!profile.name) indicators++;
	if (!profile.bio) indicators++;
	if (!profile.company) indicators++;
	if (!profile.location) indicators++;
	if (!profile.blog) indicators++;

	if (indicators >= CONFIG.THIN_PROFILE_INDICATORS_MIN) {
		flags.push({
			label: "Thin profile",
			points: CONFIG.POINTS_THIN_PROFILE_BOT,
			detail: `${indicators}/7 thin profile indicators`,
			eventBased: false,
		});
	}

	return flags;
}

export function detectIssueBurst(
	events: GitHubEvent[],
	accountName: string,
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	const issueOpenEvents = events.filter((e) => {
		if (e.type !== "IssuesEvent") return false;
		if (e.payload?.action !== "opened") return false;
		const repoOwner = e.repo?.name?.split("/")[0]?.toLowerCase();
		return repoOwner && repoOwner !== accountName.toLowerCase();
	});

	if (issueOpenEvents.length < CONFIG.ISSUE_BURST_COUNT_MIN) return flags;

	// Drive-by pattern: issues with no external code contribution.
	// Own-repo pushes don't count — someone can push to their own repos
	// while still spamming issues across many external repos.
	const hasExternalPush = events.some((e) => {
		if (e.type !== "PushEvent") return false;
		const repoOwner = e.repo?.name?.split("/")[0]?.toLowerCase();
		return repoOwner && repoOwner !== accountName.toLowerCase();
	});
	if (hasExternalPush) return flags;

	const windowMs = CONFIG.ISSUE_BURST_WINDOW_HOURS * 60 * 60 * 1000;
	const stamped = issueOpenEvents
		.map((e) => ({
			ts: dayjs.utc(e.created_at ?? "").valueOf(),
			repo: e.repo?.name ?? "",
		}))
		.filter(
			(item): item is { ts: number; repo: string } => !Number.isNaN(item.ts),
		)
		.sort((a, b) => a.ts - b.ts);

	let left = 0;
	let maxRepos = 0;
	for (let right = 0; right < stamped.length; right++) {
		while (stamped[right].ts - stamped[left].ts > windowMs) left++;
		const reposInWindow = new Set(
			stamped.slice(left, right + 1).map((t) => t.repo),
		);
		if (reposInWindow.size > maxRepos) maxRepos = reposInWindow.size;
	}

	if (maxRepos >= CONFIG.ISSUE_BURST_REPOS_MIN) {
		flags.push({
			label: "Issue burst",
			points: CONFIG.POINTS_ISSUE_BURST,
			amplifiable: true,
			detail: `Issues opened across ${maxRepos} repositories within ${CONFIG.ISSUE_BURST_WINDOW_HOURS}h with no code contributions`,
		});
	}

	return flags;
}

export function detectConsumerNoReciprocity(
	events: GitHubEvent[],
	accountName: string,
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	const consumerCount = events.filter(
		(e) => e.type === "WatchEvent" || e.type === "ForkEvent",
	).length;

	if (consumerCount < CONFIG.CONSUMER_ONLY_EXTERNAL_MIN) return flags;

	const CONTRIBUTION_TYPES = new Set([
		"PushEvent",
		"PullRequestEvent",
		"PullRequestReviewEvent",
		"PullRequestReviewCommentEvent",
	]);
	const hasExternalContribution = events.some((e) => {
		if (!CONTRIBUTION_TYPES.has(e.type ?? "")) return false;
		const repoOwner = e.repo?.name?.split("/")[0]?.toLowerCase();
		return repoOwner && repoOwner !== accountName.toLowerCase();
	});

	if (!hasExternalContribution) {
		flags.push({
			label: "Consumer with no reciprocity",
			points: CONFIG.POINTS_CONSUMER_NO_RECIPROCITY,
			detail: `${consumerCount} star/fork events with no external push or PR contributions`,
		});
	}

	return flags;
}
