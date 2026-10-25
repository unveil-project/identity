/**
 * What an event is about. The names do not belong to any platform: a provider
 * (see `fromGitHub`) maps its own event types onto them. A type the provider
 * does not know is passed through as-is, so it still counts as its own type.
 */
export type IdentifyEventType =
	| "push"
	| "create"
	| "delete"
	| "fork"
	| "star"
	| "issue"
	| "issue-comment"
	| "pull-request"
	| "review"
	| "review-comment"
	| "review-thread"
	| "commit-comment"
	| "release"
	| "member"
	| "public"
	| "wiki"
	| "discussion"
	| "sponsorship"
	| (string & {});

export type IdentifyEvent<Source = unknown> = {
	type: IdentifyEventType;
	at: string;
	repo: string;
	action?: string;
	ref?: { type?: string; name?: string };
	issue?: { title?: string };
	pullRequest?: {
		number?: number;
		isAuthor?: boolean;
	};
	actorIsApp?: boolean;
	source?: Source;
};

export type IdentifyCommit = {
	sha?: string;
	message?: string;
	repo?: string;
};

export type EventConnection<Source = unknown> = {
	from: IdentifyEvent<Source>;
	to: IdentifyEvent<Source>;
	label?: string;
};

export type EvidenceGroup =
	| "account-age"
	| "profile"
	| "repo-creation"
	| "fork"
	| "pr-volume"
	| "pr-outcome"
	| "branch-pr"
	| "comment-volume"
	| "pr-comment-volume"
	| "comment-pr-timing"
	| "timing"
	| "diversity"
	| "repo-spread"
	| "external-focus"
	| "engagement"
	| "watch"
	| "bounty"
	| "ai-attribution";

type ForkWindowFacts = {
	/** Forks in the busiest window. */
	forks: number;
	/** Every fork we saw. */
	totalForks: number;
};

type PRWindowFacts = {
	/** Opened PRs in the busiest window. */
	prs: number;
};

type CommentSprayFacts = {
	/** Comments in the busiest window. */
	comments: number;
	/** How long that window lasted. */
	windowMinutes: number;
};

type BountyPRFacts = {
	bountyPRs: number;
	openedPRs: number;
	/** Share of opened PRs that target bounty repos, from 0 to 1. */
	ratio: number;
	merged: number;
	closed: number;
};

/**
 * The numbers behind each flag, by flag id. They are what the check measured,
 * without any text. `explain` from `@unveil/identity/explain` turns them into
 * a label, a sentence and a list of metrics.
 */
export type FlagFacts = {
	"new-account": { ageDays: number };
	"young-account": { ageDays: number };
	"dormant-reactivation": {
		ageDays: number;
		repos: number;
		events: number;
		spanDays: number;
	};
	"zero-repos-external": { externalEvents: number; totalEvents: number };
	"repo-creation-extreme": { created: number; totalCreated: number };
	"repo-creation-high": { created: number; totalCreated: number };
	"always-active": {
		windowStart: string;
		hoursActive: number;
		longestRestHours: number;
		events: number;
	};
	"narrow-activity": { eventTypes: number; entropy: number };
	"issue-comment-spray-extreme": CommentSprayFacts & { repos: number };
	"issue-comment-spray-high": CommentSprayFacts & { repos: number };
	"pr-comment-spray-extreme": CommentSprayFacts & { prs: number };
	"pr-comment-spray-high": CommentSprayFacts & { prs: number };
	"star-spray-extreme": {
		repos: number;
		windowMinutes: number;
		totalStars: number;
	};
	"star-spray-high": {
		repos: number;
		windowMinutes: number;
		totalStars: number;
	};
	"branch-pr-pattern": {
		pairs: number;
		/** Fewer pairs than this do not count. Higher for established accounts. */
		minPairs: number;
		branches: number;
		ownBranches: number;
		/** Matched pairs out of all branches, from 0 to 1. */
		ratio: number;
		minRatio: number;
		maxGapSeconds: number;
	};
	"fork-pr-pattern": {
		pairs: number;
		minPairs: number;
		branches: number;
		ratio: number;
		minRatio: number;
		maxGapSeconds: number;
	};
	"rapid-prs": {
		prs: number;
		minPRs: number;
		repo: string;
		maxGapSeconds: number;
	};
	"closed-pr-spray": {
		closed: number;
		minClosed: number;
		repos: number;
		spanDays: number;
		spanMinutes: number;
		/** Closures on each busy day, biggest first. */
		spikeDays: number[];
		perDay: number;
	};
	"closed-pr-burst": {
		closed: number;
		minClosed: number;
		repos: number;
		spanMinutes: number;
	};
	"fork-extreme": ForkWindowFacts;
	"fork-severe": ForkWindowFacts;
	"fork-spike": ForkWindowFacts;
	"fork-multiple": ForkWindowFacts;
	"fork-surge-48h": ForkWindowFacts;
	"fork-surge-72h": ForkWindowFacts;
	"fork-rate": { perDay: number; spanDays: number; totalForks: number };
	"fork-streak": { streakDays: number; activeDays: number; totalForks: number };
	"fork-scatter": { repos: number; totalForks: number; spanDays: number };
	"fork-chain": { forks: number; branches: number; prs: number };
	"young-pr-volume-extreme": { prs: number; spanDays: number; perDay: number };
	"young-pr-volume-high": { prs: number; spanDays: number; perDay: number };
	"coding-streak": { streakDays: number; uniformDays: number };
	"coding-marathons": { uniformDays: number };
	"repo-spread-extreme": { repos: number; externalEvents: number };
	"repo-spread-high": { repos: number; externalEvents: number };
	"external-pr-day": PRWindowFacts;
	"external-pr-week": PRWindowFacts;
	"external-contributor": { externalPRs: number; ownRepos: number };
	"mostly-external": {
		/** Share of events on other people's repos, from 0 to 1. */
		ratio: number;
		externalEvents: number;
		totalEvents: number;
		ownRepos: number;
	};
	"limited-engagement": { externalPRs: number };
	"push-burst": { pairs: number; pushes: number };
	"pr-volume-day": PRWindowFacts;
	"pr-volume-week-extreme": PRWindowFacts;
	"pr-volume-week-high": PRWindowFacts;
	"pr-distributed": {
		prs: number;
		repos: number;
		/** 0 when every PR happened at the same moment. */
		perWeek: number;
		busiest30Days: number;
	};
	"comment-pr-fast": { repos: number; fastestSeconds: number };
	"bounty-prs-high": BountyPRFacts;
	"bounty-prs-low": BountyPRFacts;
	"bounty-labels": { issues: number; repos: number };
	"ai-branch-prefix": {
		aiBranches: number;
		branches: number;
		ratio: number;
		prefixes: string[];
	};
	"ai-commits": {
		aiCommits: number;
		commits: number;
		ratio: number;
		multiplier: number;
		/** False when there were no automation flags for the multiplier to raise. */
		amplified: boolean;
	};
};

export type FlagId = keyof FlagFacts;

type FlagBase<Source> = {
	points: number;
	/** Points after the AI and bounty multipliers. */
	effectivePoints?: number;
	group: EvidenceGroup;
	events: IdentifyEvent<Source>[];
	connections?: EventConnection<Source>[];
	amplifiable?: boolean;
};

/**
 * One thing a check found. Narrow on `id` to read its `facts`:
 *
 * @example
 * if (flag.id === "fork-spike") flag.facts.forks;
 */
export type IdentifyFlag<Source = unknown, Id extends FlagId = FlagId> = {
	[K in Id]: FlagBase<Source> & { id: K; facts: FlagFacts[K] };
}[Id];

/**
 * How much one group took off the score. Flags of 30, 20 and 10 give
 * `rawPoints` 60 and `points` 38 (30, plus 25% of 20 and 10).
 */
export type ScoredGroup = {
	group: EvidenceGroup;
	flagCount: number;
	/** Every flag's points added up. For display only: the score ignores it. */
	rawPoints: number;
	/** What the score really lost: the biggest flag, plus 25% of the other flags. */
	points: number;
};

/** The account to analyse, in a shape that works for any platform. */
export type IdentifyAccount = {
	login: string;
	/** When the account was created, as an ISO timestamp. */
	createdAt: string;
	publicRepos: number;
	/** True when the platform says the account is an app, not a person. */
	isApp?: boolean;
	/** The platform's own id for the account. */
	id?: string;
	/** The display name, when the account has one. */
	name?: string | null;
	bio?: string | null;
	avatarUrl?: string;
	/** The account's page on the platform. */
	url?: string;
	followers?: number;
	following?: number;
};

/**
 * What `identify` needs. Build it with a provider, like `fromGitHub`, or by
 * hand from your own data.
 */
export type IdentifyInput<Source = unknown> = {
	account: IdentifyAccount;
	events: IdentifyEvent<Source>[];
	commits?: IdentifyCommit[];
	/**
	 * The most events the platform ever returns. When we get this many, the
	 * window is marked `saturated`. Leave it out if there is no such limit.
	 */
	eventCap?: number;
};

export type IdentifyOptions<Source = unknown> = IdentifyInput<Source> & {
	/** Repositories ("owner/name") to leave out of the analysis. */
	excludeRepos?: string[];
};

export type IdentityClassification =
	| "organic"
	| "mixed"
	| "automation"
	| "insufficient-data";

/** Describes the events we looked at. */
export type WindowInfo = {
	eventCount: number;
	/** Days between the first and the last event we saw. */
	spanDays: number;
	firstEventAt: string | null;
	lastEventAt: string | null;
	/** True if the platform hit its limit. The real counts are higher than what we see. */
	saturated: boolean;
};

export type TimezoneEstimate = {
	offsetHours: number;
	/**
	 * How clear the daily pattern is, from 0 to 1. Under TZ_MIN_CONFIDENCE there
	 * is no pattern to find, and the offset stays 0.
	 */
	confidence: number;
};

export type IdentifyResult<Source = unknown> = {
	score: number;
	classification: IdentityClassification;
	/** How sure we are about the result, from 0 to 1. */
	confidence: number;
	isBountyHunter: boolean;
	/**
	 * True when the account is an app (`coderabbitai[bot]` and friends) rather
	 * than a person. Taken from the platform's own account type (`isApp` on the
	 * account or `actorIsApp` on an event), so it is a fact and not a score.
	 * Scoring is unchanged: the maintainer decides if an app is welcome in the
	 * context you are checking.
	 */
	isGitHubApp: boolean;
	flags: IdentifyFlag<Source>[];
	/** How much each group added to the score. */
	groups: ScoredGroup[];
	window: WindowInfo;
	timezone: TimezoneEstimate;
	profile: {
		age: number;
		repos: number;
	};
};

export type FlagReturn = {
	flags: IdentifyFlag[];
};
