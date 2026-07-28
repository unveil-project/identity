import type { Endpoints } from "@octokit/types";

export type GitHubUser = Endpoints["GET /users/{username}"]["response"]["data"];

export type GitHubEvent =
	Endpoints["GET /users/{username}/events/public"]["response"]["data"][number] & {
		payload?: {
			ref_type?: string;
			ref?: string;
			action?: string;
			issue?: {
				title?: string;
				[key: string]: unknown;
			};
			pull_request?: {
				number?: number;
				head?: {
					repo?: {
						url?: string;
					};
				};
				[key: string]: unknown;
			};
			[key: string]: unknown;
		};
	};

export type GitHubCommit = {
	sha?: string;
	message?: string;
	repo?: string;
};

export type FlagDataPoint = {
	label: string;
	value: number | string | boolean;
	threshold?: number | string;
};

export type EventConnection = {
	from: GitHubEvent;
	to: GitHubEvent;
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

export type IdentifyFlag = {
	label: string;
	/** Points the check gave, before multipliers and grouping. */
	points: number;
	/** Points after the AI and bounty multipliers. Set by `scoreFlags`. */
	effectivePoints?: number;
	group: EvidenceGroup;
	detail: string;
	data: FlagDataPoint[];
	events: GitHubEvent[];
	connections?: EventConnection[];
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

/**
 * The user to analyse. Pass the whole GET /users/{username} response — any
 * field we do not use is ignored.
 *
 * Only `login`, `created_at` and `public_repos` are needed. The other fields
 * turn on extra checks when they are there, and are skipped when they are not,
 * so you can also pass a smaller object built from your own database.
 */
export type IdentifyUser = {
	login: string;
	created_at: string;
	public_repos: number;
	followers?: number | null;
	following?: number | null;
	bio?: string | null;
	blog?: string | null;
	company?: string | null;
	location?: string | null;
	email?: string | null;
	twitter_username?: string | null;
	type?: string;
};

export type IdentifyOptions = {
	user: IdentifyUser;
	events: GitHubEvent[];
	excludeRepos?: string[];
	commits?: GitHubCommit[];
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
	/** True if GitHub hit its limit. The real counts are higher than what we see. */
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

export type IdentifyResult = {
	score: number;
	classification: IdentityClassification;
	/** How sure we are about the result, from 0 to 1. */
	confidence: number;
	isBountyHunter: boolean;
	flags: IdentifyFlag[];
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
