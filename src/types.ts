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

/**
 * One thing the account did, in a shape that works for any platform.
 *
 * `Source` is the platform's original event, kept in `source` so the events a
 * flag points at can be traced back to it.
 */
export type IdentifyEvent<Source = unknown> = {
	type: IdentifyEventType;
	/** When it happened, as an ISO timestamp. */
	at: string;
	/**
	 * The repository's full path, "owner/name". The owner is everything before
	 * the last slash, so nested groups ("group/subgroup/name") work too.
	 */
	repo: string;
	/** What happened, for types that say: "opened", "closed", "merged", "labeled"… */
	action?: string;
	/** For "create": what was created ("branch", "repository", "tag") and its name. */
	ref?: { type?: string; name?: string };
	issue?: { title?: string };
	pullRequest?: {
		number?: number;
		/**
		 * True when the account submitted this PR. False when, for example, it
		 * closed or merged someone else's PR as a maintainer.
		 */
		isAuthor?: boolean;
	};
	/** True when the platform says an app, not a person, did this. */
	actorIsApp?: boolean;
	source?: Source;
};

export type IdentifyCommit = {
	sha?: string;
	message?: string;
	/** The repository's full path, "owner/name". */
	repo?: string;
};

export type FlagDataPoint = {
	label: string;
	value: number | string | boolean;
	threshold?: number | string;
};

export type EventConnection<Source = unknown> = {
	from: IdentifyEvent<Source>;
	to: IdentifyEvent<Source>;
	label?: string;
};

/**
 * Groups of flags. Flags in the same group are about the same behaviour, so
 * they do not fully add up. Flags in different groups do. See `scoreFlags`.
 */
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

export type IdentifyFlag<Source = unknown> = {
	label: string;
	/** Points the check gave, before multipliers and grouping. */
	points: number;
	/** Points after the AI and bounty multipliers. Set by `scoreFlags`. */
	effectivePoints?: number;
	group: EvidenceGroup;
	detail: string;
	data: FlagDataPoint[];
	events: IdentifyEvent<Source>[];
	connections?: EventConnection<Source>[];
	amplifiable?: boolean;
};

/** Shows how each group added to the final score. */
export type ScoredGroup = {
	group: EvidenceGroup;
	flagCount: number;
	/** All the flag points in this group, simply added up. */
	rawPoints: number;
	/** What the group really added: the biggest flag, plus a little for the rest. */
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
