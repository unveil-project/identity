export const CONFIG = {
	/**
	 * Classification thresholds (inverted score: 100 = human, 0 = bot)
	 * >= this = "organic"
	 */
	THRESHOLD_HUMAN: 70,
	/** >= this = "mixed", below = "automation" */
	THRESHOLD_SUSPICIOUS: 50,

	/**
	 * Flag groups
	 * In one group the biggest flag counts fully, the other flags count this much
	 */
	EXTRA_FLAG_WEIGHT: 0.25,

	/** How much activity we need before we trust a "looks fine" result */
	MIN_EVENTS_FOR_CLASSIFICATION: 10,
	/** this many events is as sure as we get */
	CONFIDENCE_FULL_EVENTS: 60,
	/** this many days is as sure as we get */
	CONFIDENCE_FULL_SPAN_DAYS: 30,
	/** under this we say "insufficient-data" */
	CONFIDENCE_MIN_FOR_RESULT: 0.35,

	/**
	 * Guessing the account's timezone
	 * we need this many events before we try
	 */
	TZ_MIN_EVENTS: 20,
	/** we assume people are busiest at 2pm their time */
	TZ_LOCAL_ACTIVITY_CENTER: 14,
	/** under this there is no clear pattern, so we use 0 */
	TZ_MIN_CONFIDENCE: 0.15,

	/**
	 * Account age thresholds (days)
	 * < this = "new account"
	 */
	AGE_NEW_ACCOUNT: 30,
	/** < this = "young account" */
	AGE_YOUNG_ACCOUNT: 90,

	/** Account age penalty points */
	POINTS_NEW_ACCOUNT: 20,
	POINTS_YOUNG_ACCOUNT: 10,

	/**
	 * Old accounts that sat unused and then woke up (these get bought and sold)
	 * account at least this old
	 */
	DORMANCY_INFERRED_MIN_AGE_DAYS: 365,
	/** ...and all activity we see fits in this many days */
	DORMANCY_INFERRED_MAX_SPAN_DAYS: 21,
	/** ...and it has almost no repos */
	DORMANCY_INFERRED_MAX_REPOS: 2,
	POINTS_DORMANT_REACTIVATION: 30,

	/** Minimum events required for activity analysis */
	MIN_EVENTS_FOR_ANALYSIS: 10,

	/**
	 * Fork surge thresholds (time-based clustering, applies uniformly to all accounts)
	 * >= this forks within 24 hours = "fork surge"
	 */
	FORKS_EXTREME: 8,
	/** >= this forks within 24 hours = "multiple forks" */
	FORKS_HIGH: 5,
	/** >= this forks within 24 hours = severe automation */
	FORKS_SURGE_SEVERE: 20,
	/** >= this forks within 24 hours = extreme automation */
	FORKS_SURGE_EXTREME_HIGH: 35,
	/** points at exactly FORKS_EXTREME forks in 24 hours */
	POINTS_FORK_SURGE: 51,
	/** points at exactly FORKS_SURGE_SEVERE forks */
	POINTS_FORK_SURGE_SEVERE: 70,
	/** points at FORKS_SURGE_EXTREME_HIGH forks and above */
	POINTS_FORK_SURGE_EXTREME_HIGH: 85,
	/** points at exactly FORKS_HIGH forks in 24 hours */
	POINTS_MULTIPLE_FORKS: 26,

	/**
	 * Multi-day fork surge (catches forks spread across multiple days)
	 * >= this forks within 48 hours = multi-day surge
	 */
	FORKS_SURGE_48H: 18,
	/** >= this forks within 72 hours = severe multi-day surge */
	FORKS_SURGE_72H: 25,
	POINTS_FORK_SURGE_48H: 65,
	POINTS_FORK_SURGE_72H: 75,

	/**
	 * Fork rate metrics (average forks per day)
	 * >= this forks/day average = sustained high fork rate
	 */
	FORKS_PER_DAY_HIGH: 8,
	/** the forks must cover this many days, or it is a burst, not a rate */
	FORK_RATE_MIN_SPAN_DAYS: 3,
	POINTS_FORKS_PER_DAY_HIGH: 55,

	/**
	 * Consecutive days of forking
	 * >= this days with fork activity = pattern
	 */
	CONSECUTIVE_FORK_DAYS: 6,
	POINTS_CONSECUTIVE_FORK_DAYS: 40,

	/**
	 * Fork + coordinated activity combo
	 * >= this forks
	 */
	FORK_COMBINED_ACTIVITY_MIN: 12,
	/** + >= this branch creations */
	FORK_COMBINED_BRANCHES: 6,
	/** + >= this PRs = coordinated automation */
	FORK_COMBINED_PRS: 8,
	/** more PRs per branch than this is not one PR per fork */
	FORK_COMBINED_MAX_PRS_PER_BRANCH: 2,
	POINTS_FORK_COMBINED_ACTIVITY: 60,

	/**
	 * Fork repository diversity
	 * Points come from three parts added together: volume, speed and intensity.
	 * Each part is a ramp (see rampPoints), so the points grow step by step.
	 * 15 repos in a month at a calm pace stays low. Volume weighs the most:
	 * forking slowly to stay under the speed checks still costs points.
	 * >= this different repos forked before we look at all
	 */
	FORK_REPO_DIVERSITY_HIGH: 15,
	/** different repos forked -> points */
	FORK_SCATTER_VOLUME_RAMP: [
		[15, 8],
		[20, 15],
		[30, 25],
		[60, 35],
	],
	/** different repos per week, over the whole span -> points */
	FORK_SCATTER_SPEED_RAMP: [
		[4, 0],
		[7, 10],
		[14, 15],
		[28, 20],
	],
	/** most different repos forked within any 7 days -> points */
	FORK_SCATTER_INTENSITY_RAMP: [
		[7, 0],
		[10, 5],
		[20, 10],
		[40, 15],
	],

	/**
	 * Inhuman daily activity
	 * >= this unique hours in a day = inhuman
	 */
	HOURS_PER_DAY_INHUMAN: 16,
	/** ...spread this evenly over those hours (0 = one hour, 1 = perfectly even) */
	MARATHON_HOUR_EVENNESS_MIN: 0.8,
	/** consecutive days with 16+ hours */
	CONSECUTIVE_INHUMAN_DAYS_EXTREME: 3,
	/** non-consecutive days with 16+ hours */
	FREQUENT_MARATHON_DAYS: 5,
	POINTS_NONSTOP_ACTIVITY: 40,
	POINTS_FREQUENT_MARATHON: 25,

	/**
	 * Repo spread thresholds (external repos only, young accounts only)
	 * >= this = extreme spread
	 */
	REPO_SPREAD_EXTREME: 30,
	/** >= this = wide spread */
	REPO_SPREAD_HIGH: 20,
	POINTS_EXTREME_REPO_SPREAD_YOUNG: 30,
	POINTS_WIDE_REPO_SPREAD_YOUNG: 15,

	/**
	 * External PRs (we use the busiest stretch anywhere in the data)
	 * >= this in any 24 hours = PR burst
	 */
	PRS_TODAY_EXTREME: 15,
	/** >= this in any 7 days = high frequency */
	PRS_WEEK_HIGH: 20,
	POINTS_PR_BURST: 20,
	POINTS_HIGH_PR_FREQUENCY: 15,

	/**
	 * Extreme PR spam (all accounts, busiest stretch anywhere in the data)
	 * >= this many PRs in any 24 hours = extreme daily spam
	 */
	PRS_DAY_EXTREME: 30,
	POINTS_PRS_DAY_EXTREME: 45,
	/** >= this many PRs in any 7 days = extreme weekly spam */
	PRS_WEEK_EXTREME: 100,
	POINTS_PRS_WEEK_EXTREME: 50,
	/** >= this many PRs in any 7 days = very high weekly spam */
	PRS_WEEK_VERY_HIGH: 50,
	POINTS_PRS_WEEK_VERY_HIGH: 40,
	/** PRs to this many different repos in any 24 hours = no person switches projects that fast */
	PR_REPOS_DAY_HIGH: 20,
	/** points keep growing up to this many repos */
	PR_REPOS_DAY_EXTREME: 30,
	/** points at PR_REPOS_DAY_HIGH repos: automation on its own */
	POINTS_PR_REPOS_DAY_HIGH: 51,
	/** points at PR_REPOS_DAY_EXTREME repos and above */
	POINTS_PR_REPOS_DAY_EXTREME: 60,

	/**
	 * Distributed PR spam (high PR count + many repos)
	 * PR count threshold for combined check
	 */
	PRS_SPAM_VOLUME: 50,
	/** repos threshold for combined check */
	REPOS_SPAM_SPREAD: 15,

	/**
	 * Distributed PR spam density guards (prevent flagging long-term contributors)
	 * >= this PRs/week = suspicious density (distributed spam)
	 */
	PRS_SPAM_DENSITY_PER_WEEK: 15,
	/** >= this many PRs in any 30 days + many repos = flag */
	PRS_SPAM_ROLLING_30DAYS: 60,
	/** points at exactly PRS_SPAM_ROLLING_30DAYS PRs in 30 days */
	POINTS_PR_SPAM_DISTRIBUTED: 45,
	/** this many PRs in any 30 days + many repos = clear automation */
	PRS_SPAM_ROLLING_30DAYS_EXTREME: 90,
	/** points at PRS_SPAM_ROLLING_30DAYS_EXTREME and above */
	POINTS_PR_SPAM_DISTRIBUTED_EXTREME: 55,

	/**
	 * PR-only contributor
	 * external PRs threshold
	 */
	EXTERNAL_PRS_MIN: 15,
	/** < this personal repos with many external PRs */
	PERSONAL_REPOS_LOW: 5,
	POINTS_PR_ONLY_CONTRIBUTOR: 20,

	/**
	 * External activity ratio
	 * 95%+ external
	 */
	FOREIGN_RATIO_HIGH: 0.95,
	POINTS_NO_PERSONAL_ACTIVITY: 30,
	POINTS_EXTERNAL_FOCUS: 20,

	/**
	 * Zero repos with activity
	 * 0 repos but this many events = suspicious
	 */
	ZERO_REPOS_MIN_EVENTS: 20,
	/** this share of external activity under one owner = that owner is the account's home */
	HOME_OWNER_MIN_SHARE: 0.5,
	POINTS_ZERO_REPOS_ACTIVE: 20,

	/** PRs per day for young accounts (average over the days the PRs cover) */
	YOUNG_PRS_PER_DAY_HIGH: 4,
	YOUNG_PRS_PER_DAY_EXTREME: 7.5,
	POINTS_YOUNG_PR_VOLUME_HIGH: 20,
	POINTS_YOUNG_PR_VOLUME_EXTREME: 35,
	/** a young account with this many PRs per day is automation */
	YOUNG_PRS_PER_DAY_SEVERE: 20,
	/** same as POINTS_PRS_DAY_EXTREME for any account */
	POINTS_YOUNG_PR_VOLUME_SEVERE: 45,

	/**
	 * Pushes to the same repository in quick succession
	 * two pushes this close count as a pair
	 */
	TIGHT_COMMIT_SECONDS: 60 * 10,
	/** >= this many pairs = push burst */
	TIGHT_COMMIT_THRESHOLD_GLOBAL: 70,
	POINTS_TIGHT_BURST: 25,

	/**
	 * Rapid repo creation (filters CreateEvent by ref_type === "repository" only)
	 * need at least this many repo creations to analyze
	 */
	CREATE_EVENTS_MIN: 5,
	/** >= 16 repos created in 24 hours = extreme automation */
	CREATE_BURST_EXTREME: 16,
	/** >= 8 repos created in 24 hours = suspicious */
	CREATE_BURST_HIGH: 8,
	POINTS_CREATE_BURST_EXTREME: 35,
	POINTS_CREATE_BURST_HIGH: 25,

	/**
	 * 24/7 activity (we slide a 24 hour window over the events, not calendar days)
	 * busy in 21+ different hours = suspicious
	 */
	HOURS_ACTIVE_EXTREME: 21,
	/** each busy hour needs at least this many events */
	EVENTS_PER_HOUR_MIN: 2.0,
	/** longest quiet gap under this = no time to sleep */
	REST_GAP_MIN_HOURS: 3,
	/** longest quiet gap under this = no rest at all */
	REST_GAP_NONE_HOURS: 1,
	POINTS_24_7_ACTIVITY: 25,
	POINTS_24_7_NO_REST: 38,
	/** accounts older than this (days) can get softer checks */
	AGE_ESTABLISHED_ACCOUNT: 1000,

	/**
	 * Event type diversity (bots have narrow activity)
	 * <= this many kinds of event...
	 */
	DIVERSITY_MAX_EVENT_TYPES: 3,
	/** ...spread less evenly than this = narrow focus */
	DIVERSITY_MAX_ENTROPY: 0.8,
	POINTS_LOW_DIVERSITY: 20,

	/**
	 * Issue comment spam (multiple comments to different repos in short timeframe)
	 * time window to group comments
	 */
	ISSUE_COMMENT_SPAM_WINDOW_MINUTES: 2,
	/** >= this different repos = comment spray bot */
	ISSUE_COMMENT_SPRAY_EXTREME: 15,
	/** >= this different repos in short window = suspicious */
	ISSUE_COMMENT_SPRAY_HIGH: 10,
	/** need at least this many comments to analyze */
	ISSUE_COMMENT_MIN_FOR_SPRAY: 10,
	POINTS_ISSUE_COMMENT_SPRAY_EXTREME: 40,
	POINTS_ISSUE_COMMENT_SPRAY_HIGH: 30,

	/**
	 * PR comment spam (multiple review comments on different PRs/repos in short timeframe)
	 * time window to group PR comments
	 */
	PR_COMMENT_SPAM_WINDOW_MINUTES: 2,
	/** >= this different PRs = PR comment spam bot */
	PR_COMMENT_SPRAY_EXTREME: 12,
	/** >= this different PRs in short window = suspicious */
	PR_COMMENT_SPRAY_HIGH: 8,
	/** need at least this many PR comments to analyze */
	PR_COMMENT_MIN_FOR_SPRAY: 8,
	POINTS_PR_COMMENT_SPRAY_EXTREME: 38,
	POINTS_PR_COMMENT_SPRAY_HIGH: 28,

	/**
	 * Branch→PR temporal correlation (rapid branch-to-PR pattern, not necessarily automated)
	 * PR must follow branch within this window
	 */
	BRANCH_PR_TIME_WINDOW_SECONDS: 90,
	/** need at least this many correlated pairs to flag */
	BRANCH_PR_PATTERN_MIN_PAIRS: 8,
	/** stricter threshold for established accounts (same-repo check) */
	BRANCH_PR_PATTERN_MIN_PAIRS_ESTABLISHED: 15,
	/** lower threshold for fork-workflow check (cross-repo match is already more specific) */
	BRANCH_PR_FORK_MIN_PAIRS_ESTABLISHED: 10,
	/** >= 65% of branches must have matching PRs */
	BRANCH_PR_PATTERN_RATIO_MIN: 0.65,
	/** stricter ratio for established (80%) */
	BRANCH_PR_PATTERN_RATIO_MIN_ESTABLISHED: 0.8,
	/** branches/PRs ratio must be >= this (low ratio = legitimate dev with many unrelated PRs) */
	BRANCH_PR_COUNT_RATIO_MIN: 0.65,
	/** suspicious timing pattern; can also occur with fast manual workflows */
	POINTS_BRANCH_PR_AUTOMATION: 35,

	/**
	 * Rapid PR spam (multiple PRs to same repo in rapid succession - fork spam pattern)
	 * PRs this close to the previous one keep a run going
	 */
	RAPID_PR_MAX_GAP_SECONDS: 90,
	/** need at least this many rapid successive PRs to flag (young accounts) */
	RAPID_PR_SPAM_MIN_PRS: 4,
	/** stricter threshold for established accounts */
	RAPID_PR_SPAM_MIN_PRS_ESTABLISHED: 6,
	/** fork spam attack indicator */
	POINTS_RAPID_PR_SPAM: 40,

	/**
	 * Closed PR spam (many PRs closed across different repos - rejected/unwanted contributions)
	 * need at least this many closed PRs to flag (young accounts)
	 */
	CLOSED_PR_SPAM_MIN: 5,
	/** stricter threshold for established accounts */
	CLOSED_PR_SPAM_MIN_ESTABLISHED: 8,
	/** minimum different repos for spray detection */
	CLOSED_PR_REPO_SPREAD: 3,
	/** PRs closed within this window = concentrated spray */
	CLOSED_PR_TIME_WINDOW_MINUTES: 60,
	/** a concentrated spray needs at least this many repos */
	CLOSED_PR_BURST_MIN_REPOS: 2,
	/** a day with this many closures is listed as a spike day */
	CLOSED_PR_SPIKE_DAY_MIN: 10,
	/** minimum PRs per day average to flag spray pattern */
	CLOSED_PR_MIN_DENSITY: 1,
	/** 25+ closed PRs = high volume rejected submissions */
	CLOSED_PR_VOLUME_HIGH: 25,
	/** 100+ closed PRs = ecosystem-wide spam */
	CLOSED_PR_VOLUME_EXTREME: 100,
	/** points at exactly CLOSED_PR_SPAM_MIN closed PRs */
	POINTS_CLOSED_PR_SPAM: 35,
	/** points at CLOSED_PR_VOLUME_HIGH */
	POINTS_CLOSED_PR_SPAM_HIGH: 55,
	/** points at CLOSED_PR_VOLUME_EXTREME and above */
	POINTS_CLOSED_PR_SPAM_EXTREME: 75,
	/** 100+ closed PRs in burst = coordinated attack */
	POINTS_CLOSED_PR_SPAM_BURST_EXTREME: 80,

	/**
	 * Limited community engagement (young accounts with zero engagement event types)
	 * one or two PRs from a newcomer are too few to call it a pattern
	 */
	LIMITED_ENGAGEMENT_MIN_PRS: 3,
	POINTS_LIMITED_ENGAGEMENT: 25,

	/** Watch/star farming (bulk starring of repos in a short time window) */
	WATCH_SPAM_MIN_EVENTS: 10,
	WATCH_SPAM_WINDOW_HOURS: 24,
	/** >= 20 different repos starred in 24h = suspicious */
	WATCH_SPAM_REPOS_HIGH: 20,
	/** >= 50 different repos starred in 24h = farming */
	WATCH_SPAM_REPOS_EXTREME: 50,
	POINTS_WATCH_SPAM_HIGH: 20,
	POINTS_WATCH_SPAM_EXTREME: 35,

	/**
	 * Comment-before-PR pattern
	 * Flags accounts that comment on an issue and open a PR to the same repo
	 * in an implausibly short time — not enough time to read, implement, and push.
	 * comment→PR gap must be under this
	 */
	COMMENT_BEFORE_PR_VERY_FAST_MINUTES: 5,
	/** must occur across at least this many repos */
	COMMENT_BEFORE_PR_VERY_FAST_MIN_REPOS: 2,
	POINTS_COMMENT_BEFORE_PR_VERY_FAST: 30,

	/**
	 * Bounty repository PR farming
	 * Detects accounts whose opened PRs predominantly target known bounty program repos.
	 * Repositories are matched by `isBountyRepo` in src/data/bounty-repos.ts.
	 * a repo name listed under this many owners is a campaign copied across accounts
	 */
	BOUNTY_CAMPAIGN_MIN_OWNERS: 3,
	/** need at least this many opened PRs to analyze */
	BOUNTY_REPO_MIN_PRS: 3,
	/** >= 75% of PRs to bounty repos = strong signal */
	BOUNTY_REPO_RATIO_HIGH: 0.75,
	/** >= 40% of PRs to bounty repos = moderate signal */
	BOUNTY_REPO_RATIO_LOW: 0.4,
	/** >= 50% of closed bounty PRs merged = skip multiplier (legitimate contributor) */
	BOUNTY_REPO_MERGE_RATE_CLEAN: 0.5,
	/** >= 75% bounty PR ratio — multiplies existing automation signals */
	BOUNTY_MULTIPLIER_HIGH: 1.3,
	/** >= 40% bounty PR ratio or labeling activity — mild multiplier */
	BOUNTY_MULTIPLIER_LOW: 1.15,

	/**
	 * AI agent branch prefix detection
	 * AI agent branches needed; one can be a trial
	 */
	AI_BRANCH_MIN: 2,
	/** no penalty: the proof keeps the score below organic instead (see capForAIAttribution) */
	POINTS_AI_BRANCH_PREFIX: 0,

	/**
	 * Comments and issues that an AI agent app posted for the account
	 * one post can be a trial or an accident; two means the account came back to the agent
	 */
	AI_AGENT_APP_MIN_POSTS: 2,
	/** no penalty: the proof keeps the score below organic instead (see capForAIAttribution) */
	POINTS_AI_AGENT_APP: 0,

	/**
	 * AI use that is too much: AI-made items on the busiest day
	 * up to this many AI agent branches in 24 hours: 0 points
	 */
	AI_BRANCHES_DAY_LIGHT: 8,
	AI_BRANCHES_DAY_HEAVY: 16,
	/** points at AI_BRANCHES_DAY_HEAVY branches */
	POINTS_AI_BRANCHES_DAY_HEAVY: 30,
	AI_BRANCHES_DAY_EXTREME: 30,
	/** points at AI_BRANCHES_DAY_EXTREME and above: automation on its own */
	POINTS_AI_BRANCHES_DAY_EXTREME: 51,
	/** up to this many AI agent app posts in 24 hours: 0 points */
	AI_POSTS_DAY_LIGHT: 40,
	AI_POSTS_DAY_HEAVY: 60,
	/** points at AI_POSTS_DAY_HEAVY posts */
	POINTS_AI_POSTS_DAY_HEAVY: 30,
	AI_POSTS_DAY_EXTREME: 120,
	/** points at AI_POSTS_DAY_EXTREME and above: automation on its own */
	POINTS_AI_POSTS_DAY_EXTREME: 51,

	/**
	 * Bounty label infrastructure detection
	 * need at least this many bounty-labelled issues to flag
	 */
	BOUNTY_LABEL_MIN: 3,
	POINTS_BOUNTY_LABEL_INFRA: 25,

	/** @deprecated No check uses it. It will be removed in v4. */
	POINTS_NO_IDENTITY: 15,
	/** @deprecated No check uses it. It will be removed in v4. */
	FOLLOW_RATIO_FOLLOWING_MIN: 50,
	/** @deprecated No check uses it. It will be removed in v4. */
	FOLLOW_RATIO_FOLLOWERS_MAX: 5,
	/** @deprecated No check uses it. It will be removed in v4. */
	POINTS_FOLLOW_RATIO: 15,
	/** @deprecated No check uses it. It will be removed in v4. */
	POINTS_ZERO_FOLLOWERS: 10,
	/** @deprecated No check uses it. It will be removed in v4. */
	ZERO_FOLLOWERS_MIN_AGE_DAYS: 90,
	/** @deprecated Use `YOUNG_PRS_PER_DAY_HIGH`. It will be removed in v4. */
	ACTIVITY_DENSITY_HIGH: 8,
	/** @deprecated Use `YOUNG_PRS_PER_DAY_EXTREME`. It will be removed in v4. */
	ACTIVITY_DENSITY_EXTREME: 15,
	/** @deprecated Use `POINTS_YOUNG_PR_VOLUME_HIGH`. It will be removed in v4. */
	POINTS_HIGH_ACTIVITY_DENSITY: 15,
	/** @deprecated Use `POINTS_YOUNG_PR_VOLUME_EXTREME`. It will be removed in v4. */
	POINTS_EXTREME_ACTIVITY_DENSITY: 25,
	/** @deprecated No check uses it. It will be removed in v4. */
	AI_BRANCH_MIN_CREATIONS: 3,
	/** @deprecated No check uses it. It will be removed in v4. */
	AI_BRANCH_RATIO_MIN: 0.5,
	/** @deprecated Fork scatter now uses the FORK_SCATTER_* ramps. It will be removed in v4. */
	POINTS_FORK_DIVERSITY: 45,
	/** @deprecated No check uses it. It will be removed in v4. */
	ORGANIC_ISSUE_MIN_COUNT: 3,
	/** @deprecated No check uses it. It will be removed in v4. */
	ORGANIC_ISSUE_MIN_REPOS: 2,
	/** @deprecated No check uses it. It will be removed in v4. */
	ORGANIC_ISSUE_MIN_DAYS: 7,
	/** @deprecated No check uses it. It will be removed in v4. */
	POINTS_ORGANIC_ISSUE_ENGAGEMENT: 15,
	/** @deprecated No check uses it. It will be removed in v4. */
	ORGANIC_MERGED_PR_MIN: 3,
	/** @deprecated No check uses it. It will be removed in v4. */
	ORGANIC_MERGED_PR_HIGH: 10,
	/** @deprecated No check uses it. It will be removed in v4. */
	ORGANIC_MERGED_PR_EXTREME: 25,
	/** @deprecated No check uses it. It will be removed in v4. */
	ORGANIC_MERGED_PR_MIN_RATE: 0.5,
	/** @deprecated No check uses it. It will be removed in v4. */
	ORGANIC_MERGED_PR_MIN_OPENED: 3,
	/** @deprecated No check uses it. It will be removed in v4. */
	POINTS_ORGANIC_MERGED_PR: 10,
	/** @deprecated No check uses it. It will be removed in v4. */
	POINTS_ORGANIC_MERGED_PR_HIGH: 20,
	/** @deprecated No check uses it. It will be removed in v4. */
	POINTS_ORGANIC_MERGED_PR_EXTREME: 30,
} as const;
