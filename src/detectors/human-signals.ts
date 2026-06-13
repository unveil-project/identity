import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { CONFIG } from "../config";
import type { GitHubEvent, IdentifyFlag, IdentifyProfile } from "../types";

dayjs.extend(utc);

export function detectMergedContributions(
	events: GitHubEvent[],
	accountName: string,
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];
	const mergedPRRepos = new Set<string>();

	for (const e of events) {
		if (e.type !== "PullRequestEvent") continue;
		const action = e.payload?.action;
		const isMerged =
			action === "merged" ||
			(action === "closed" && e.payload?.pull_request?.merged === true);
		if (!isMerged) continue;
		const repoOwner = e.repo?.name?.split("/")[0]?.toLowerCase();
		if (repoOwner && repoOwner !== accountName.toLowerCase() && e.repo?.name) {
			mergedPRRepos.add(e.repo.name);
		}
	}

	if (mergedPRRepos.size >= CONFIG.MERGED_PR_REPOS_HIGH) {
		flags.push({
			label: "Established contributor",
			points: CONFIG.POINTS_ESTABLISHED_CONTRIBUTOR_HIGH,
			detail: `Merged PRs in ${mergedPRRepos.size} external repositories`,
		});
	} else if (mergedPRRepos.size >= CONFIG.MERGED_PR_REPOS_MIN) {
		flags.push({
			label: "External contributor",
			points: CONFIG.POINTS_ESTABLISHED_CONTRIBUTOR,
			detail: `Merged PRs in ${mergedPRRepos.size} external repositories`,
		});
	}

	return flags;
}

export function detectPreAiHistory(
	repos: Array<{ created_at: string }>,
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];
	const cutoff = `${CONFIG.PRE_AI_REPOS_YEAR}-01-01`;
	const preAiRepos = repos.filter((r) => r.created_at < cutoff);

	if (preAiRepos.length >= CONFIG.PRE_AI_REPOS_HIGH) {
		flags.push({
			label: "Pre-AI development history",
			points: CONFIG.POINTS_PRE_AI_REPOS_HIGH,
			detail: `${preAiRepos.length} repositories created before ${CONFIG.PRE_AI_REPOS_YEAR}`,
		});
	} else if (preAiRepos.length >= CONFIG.PRE_AI_REPOS_MIN) {
		flags.push({
			label: "Pre-AI development history",
			points: CONFIG.POINTS_PRE_AI_REPOS,
			detail: `${preAiRepos.length} repositories created before ${CONFIG.PRE_AI_REPOS_YEAR}`,
		});
	}

	return flags;
}

export function detectReviewActivity(
	events: GitHubEvent[],
	accountName: string,
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	const reviewCount = events.filter((e) => {
		if (e.type !== "PullRequestReviewEvent") return false;
		const repoOwner = e.repo?.name?.split("/")[0]?.toLowerCase();
		return repoOwner && repoOwner !== accountName.toLowerCase();
	}).length;

	if (reviewCount >= CONFIG.REVIEW_EVENTS_HIGH) {
		flags.push({
			label: "Active code reviewer",
			points: CONFIG.POINTS_REVIEW_ACTIVITY_HIGH,
			detail: `${reviewCount} PR reviews on external repositories`,
		});
	} else if (reviewCount >= CONFIG.REVIEW_EVENTS_BASE) {
		flags.push({
			label: "Code reviewer",
			points: CONFIG.POINTS_REVIEW_ACTIVITY,
			detail: `${reviewCount} PR reviews on external repositories`,
		});
	}

	return flags;
}

export function detectReviewCommentActivity(
	events: GitHubEvent[],
	accountName: string,
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	const commentCount = events.filter((e) => {
		if (e.type !== "PullRequestReviewCommentEvent") return false;
		const repoOwner = e.repo?.name?.split("/")[0]?.toLowerCase();
		return repoOwner && repoOwner !== accountName.toLowerCase();
	}).length;

	if (commentCount >= CONFIG.REVIEW_COMMENT_EVENTS_HIGH) {
		flags.push({
			label: "Inline review commenter",
			points: CONFIG.POINTS_REVIEW_COMMENTS_HIGH,
			detail: `${commentCount} inline review comments on external repositories`,
		});
	} else if (commentCount >= CONFIG.REVIEW_COMMENT_EVENTS_BASE) {
		flags.push({
			label: "Inline review commenter",
			points: CONFIG.POINTS_REVIEW_COMMENTS,
			detail: `${commentCount} inline review comments on external repositories`,
		});
	}

	return flags;
}

export function detectFollowerCount(
	profile: IdentifyProfile | undefined,
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];
	if (!profile) return flags;

	if (profile.followers >= CONFIG.FOLLOWERS_HIGH) {
		flags.push({
			label: "Established following",
			points: CONFIG.POINTS_FOLLOWERS_HIGH,
			detail: `${profile.followers} followers`,
		});
	} else if (profile.followers >= CONFIG.FOLLOWERS_BASE) {
		flags.push({
			label: "Has followers",
			points: CONFIG.POINTS_FOLLOWERS_BASE,
			detail: `${profile.followers} followers`,
		});
	}

	return flags;
}

export function detectIdentityCompleteness(
	profile: IdentifyProfile | undefined,
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];
	if (!profile) return flags;

	let fieldCount = 0;
	if (profile.name) fieldCount++;
	if (profile.company) fieldCount++;
	if (profile.location) fieldCount++;
	if (profile.blog) fieldCount++;
	if (profile.bio && profile.bio.length >= CONFIG.IDENTITY_BIO_MIN_LENGTH)
		fieldCount++;

	if (fieldCount >= CONFIG.IDENTITY_FIELDS_ALL) {
		flags.push({
			label: "Complete profile",
			points: CONFIG.POINTS_IDENTITY_HIGH,
			detail: `${fieldCount} profile fields filled`,
		});
	} else if (fieldCount >= CONFIG.IDENTITY_FIELDS_BASE) {
		flags.push({
			label: "Partial profile",
			points: CONFIG.POINTS_IDENTITY_BASE,
			detail: `${fieldCount} profile fields filled`,
		});
	}

	return flags;
}

export function detectDormancyGap(events: GitHubEvent[]): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];
	if (events.length < 2) return flags;

	const timestamps = events
		.map((e) => e.created_at)
		.filter((t): t is string => !!t)
		.map((t) => dayjs.utc(t).valueOf())
		.sort((a, b) => a - b);

	if (timestamps.length < 2) return flags;

	let maxGapDays = 0;
	for (let i = 1; i < timestamps.length; i++) {
		const gapDays = (timestamps[i] - timestamps[i - 1]) / (1000 * 60 * 60 * 24);
		if (gapDays > maxGapDays) maxGapDays = gapDays;
	}

	if (maxGapDays >= CONFIG.DORMANCY_GAP_LONG_DAYS) {
		flags.push({
			label: "Extended dormancy period",
			points: CONFIG.POINTS_DORMANCY_GAP_LONG,
			detail: `${Math.round(maxGapDays)}-day gap in activity`,
		});
	} else if (maxGapDays >= CONFIG.DORMANCY_GAP_DAYS) {
		flags.push({
			label: "Dormancy gap",
			points: CONFIG.POINTS_DORMANCY_GAP,
			detail: `${Math.round(maxGapDays)}-day gap in activity`,
		});
	}

	return flags;
}

export function detectGistActivity(events: GitHubEvent[]): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];

	if (events.some((e) => e.type === "GistEvent")) {
		flags.push({
			label: "Gist activity",
			points: CONFIG.POINTS_GIST_ACTIVITY,
			detail: "Account has gist activity",
		});
	}

	return flags;
}

export function detectPRIterationCycles(
	events: GitHubEvent[],
	accountName: string,
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];
	const syncRepos = new Set<string>();

	for (const e of events) {
		if (e.type !== "PullRequestEvent") continue;
		if (e.payload?.action !== "synchronize") continue;
		const repoOwner = e.repo?.name?.split("/")[0]?.toLowerCase();
		if (repoOwner && repoOwner !== accountName.toLowerCase() && e.repo?.name) {
			syncRepos.add(e.repo.name);
		}
	}

	if (syncRepos.size >= CONFIG.PR_SYNC_REPOS_HIGH) {
		flags.push({
			label: "Iterated contributions",
			points: CONFIG.POINTS_PR_SYNC_HIGH,
			detail: `PR iteration cycles in ${syncRepos.size} external repositories`,
		});
	} else if (syncRepos.size >= CONFIG.PR_SYNC_REPOS_BASE) {
		flags.push({
			label: "Iterated contributions",
			points: CONFIG.POINTS_PR_SYNC_BASE,
			detail: `PR iteration cycles in ${syncRepos.size} external repositories`,
		});
	}

	return flags;
}

export function detectLongSpanEngagement(
	events: GitHubEvent[],
	accountName: string,
): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];
	const repoSpans = new Map<string, { first: number; last: number }>();

	for (const e of events) {
		if (!e.repo?.name || !e.created_at) continue;
		const repoOwner = e.repo.name.split("/")[0]?.toLowerCase();
		if (!repoOwner || repoOwner === accountName.toLowerCase()) continue;

		const ts = dayjs.utc(e.created_at).valueOf();
		const existing = repoSpans.get(e.repo.name);
		if (!existing) {
			repoSpans.set(e.repo.name, { first: ts, last: ts });
		} else {
			if (ts < existing.first) existing.first = ts;
			if (ts > existing.last) existing.last = ts;
		}
	}

	let longSpanCount = 0;
	for (const { first, last } of repoSpans.values()) {
		const spanDays = (last - first) / (1000 * 60 * 60 * 24);
		if (spanDays >= CONFIG.REPO_SPAN_MIN_DAYS) longSpanCount++;
	}

	if (longSpanCount >= CONFIG.REPO_SPAN_HIGH_COUNT) {
		flags.push({
			label: "Long-span engagement",
			points: CONFIG.POINTS_REPO_SPAN_HIGH,
			detail: `${longSpanCount} external repositories with ${CONFIG.REPO_SPAN_MIN_DAYS}+ day engagement span`,
		});
	} else if (longSpanCount >= CONFIG.REPO_SPAN_BASE_COUNT) {
		flags.push({
			label: "Long-span engagement",
			points: CONFIG.POINTS_REPO_SPAN_BASE,
			detail: `${longSpanCount} external repositories with ${CONFIG.REPO_SPAN_MIN_DAYS}+ day engagement span`,
		});
	}

	return flags;
}

export function detectDayOfWeekVariance(events: GitHubEvent[]): IdentifyFlag[] {
	const flags: IdentifyFlag[] = [];
	if (events.length < CONFIG.DOW_EVENTS_MIN) return flags;

	const counts = [0, 0, 0, 0, 0, 0, 0];
	for (const e of events) {
		if (!e.created_at) continue;
		counts[dayjs.utc(e.created_at).day()]++;
	}

	const mean = counts.reduce((a, b) => a + b, 0) / 7;
	if (mean === 0) return flags;

	const variance = counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / 7;
	const cv = Math.sqrt(variance) / mean;

	if (cv >= CONFIG.DOW_VARIANCE_CV_MIN) {
		flags.push({
			label: "Natural activity rhythm",
			points: CONFIG.POINTS_DOW_VARIANCE,
			detail: `Day-of-week variance CV ${cv.toFixed(2)} (≥${CONFIG.DOW_VARIANCE_CV_MIN} signals human rest pattern)`,
		});
	}

	return flags;
}
