export const CONFIG = {
	// Classification thresholds (inverted score: 100 = human, 0 = bot)
	THRESHOLD_HUMAN: 70, // >= this = "human"
	THRESHOLD_SUSPICIOUS: 50, // >= this = "suspicious", below = "likely_bot"

	// Account age thresholds (days)
	AGE_NEW_ACCOUNT: 30, // < this = "new account"
	AGE_YOUNG_ACCOUNT: 90, // < this = "young account"

	// Account age penalty points
	POINTS_NEW_ACCOUNT: 20,
	POINTS_YOUNG_ACCOUNT: 10,

	// Identity penalty
	POINTS_NO_IDENTITY: 15,

	// Follow ratio thresholds
	FOLLOW_RATIO_FOLLOWING_MIN: 50, // following > this AND followers < FOLLOW_RATIO_FOLLOWERS_MAX
	FOLLOW_RATIO_FOLLOWERS_MAX: 5,
	POINTS_FOLLOW_RATIO: 15,
	POINTS_ZERO_FOLLOWERS: 10,

	// Minimum events required for activity analysis
	MIN_EVENTS_FOR_ANALYSIS: 10,

	// Fork surge thresholds (time-based clustering, applies uniformly to all accounts)
	FORKS_EXTREME: 8, // >= this forks within 24 hours = "fork surge"
	FORKS_HIGH: 5, // >= this forks within 24 hours = "multiple forks"
	FORKS_SURGE_SEVERE: 20, // >= this forks within 24 hours = severe automation
	FORKS_SURGE_EXTREME_HIGH: 35, // >= this forks within 24 hours = extreme automation
	FORK_SURGE_WINDOW_HOURS: 24, // time window to detect fork clustering (spam is spam)
	POINTS_FORK_SURGE: 51, // points for 8-19 forks in 24 hours
	POINTS_FORK_SURGE_SEVERE: 70, // points for 20-34 forks in 24 hours
	POINTS_FORK_SURGE_EXTREME_HIGH: 85, // points for 35+ forks in 24 hours
	POINTS_MULTIPLE_FORKS: 26, // points for 5-7 forks in 24 hours

	// Multi-day fork surge (catches forks spread across multiple days)
	FORKS_SURGE_48H: 18, // >= this forks within 48 hours = multi-day surge
	FORKS_SURGE_72H: 25, // >= this forks within 72 hours = severe multi-day surge
	POINTS_FORK_SURGE_48H: 65,
	POINTS_FORK_SURGE_72H: 75,

	// Fork rate metrics (average forks per day)
	FORKS_PER_DAY_HIGH: 8, // >= this forks/day average = sustained high fork rate
	POINTS_FORKS_PER_DAY_HIGH: 55,

	// Consecutive days of forking
	CONSECUTIVE_FORK_DAYS: 6, // >= this days with fork activity = pattern
	POINTS_CONSECUTIVE_FORK_DAYS: 40,

	// Fork + coordinated activity combo
	FORK_COMBINED_ACTIVITY_MIN: 12, // >= this forks
	FORK_COMBINED_BRANCHES: 6, // + >= this branch creations
	FORK_COMBINED_PRS: 8, // + >= this PRs = coordinated automation
	POINTS_FORK_COMBINED_ACTIVITY: 60,

	// Fork repository diversity
	FORK_REPO_DIVERSITY_HIGH: 15, // >= this different repos forked = spread behavior
	POINTS_FORK_DIVERSITY: 45,

	// Inhuman daily activity
	HOURS_PER_DAY_INHUMAN: 16, // >= this unique hours in a day = inhuman
	CONSECUTIVE_INHUMAN_DAYS_EXTREME: 3, // consecutive days with 16+ hours
	FREQUENT_MARATHON_DAYS: 5, // non-consecutive days with 16+ hours
	POINTS_NONSTOP_ACTIVITY: 40,
	POINTS_FREQUENT_MARATHON: 25,

	// Repo spread thresholds (external repos only, young accounts only)
	REPO_SPREAD_EXTREME: 30, // >= this = extreme spread
	REPO_SPREAD_HIGH: 20, // >= this = wide spread
	POINTS_EXTREME_REPO_SPREAD_YOUNG: 30,
	POINTS_WIDE_REPO_SPREAD_YOUNG: 15,

	// External PR thresholds (time-based to catch rapid spam)
	PRS_TODAY_EXTREME: 15, // >= this in 24h = PR burst
	PRS_WEEK_HIGH: 20, // >= this in 7 days = high frequency
	POINTS_PR_BURST: 20,
	POINTS_HIGH_PR_FREQUENCY: 15,

	// Extreme PR spam detection (ALL accounts, time-windowed)
	PRS_DAY_EXTREME: 30, // >= this PRs in 24h = extreme daily spam
	POINTS_PRS_DAY_EXTREME: 45,
	PRS_WEEK_EXTREME: 100, // >= this PRs in 7 days = extreme weekly spam
	POINTS_PRS_WEEK_EXTREME: 50,
	PRS_WEEK_VERY_HIGH: 50, // >= this PRs in 7 days = very high weekly spam
	POINTS_PRS_WEEK_VERY_HIGH: 40,

	// Distributed PR spam (high PR count + many repos)
	PRS_SPAM_VOLUME: 50, // PR count threshold for combined check
	REPOS_SPAM_SPREAD: 15, // repos threshold for combined check
	POINTS_PR_SPAM_COMBINED: 45, // for combined high PR + repo spread

	// Distributed PR spam density guards (prevent flagging long-term contributors)
	PRS_SPAM_DENSITY_PER_WEEK: 15, // >= this PRs/week = suspicious density (distributed spam)
	PRS_SPAM_ROLLING_30DAYS: 60, // >= this PRs in last 30 days + meets repo spread = flag
	POINTS_PR_SPAM_DISTRIBUTED: 45, // points for distributed spam pattern

	// PR-only contributor
	EXTERNAL_PRS_MIN: 15, // external PRs threshold
	PERSONAL_REPOS_LOW: 5, // < this personal repos with many external PRs
	POINTS_PR_ONLY_CONTRIBUTOR: 20,

	// External activity ratio
	FOREIGN_RATIO_FULL: 1, // 100% external
	FOREIGN_RATIO_HIGH: 0.95, // 95%+ external
	PERSONAL_REPOS_NONE: 3, // < this with 100% external = suspicious
	POINTS_NO_PERSONAL_ACTIVITY: 30,
	POINTS_EXTERNAL_FOCUS: 20,

	// Zero repos with activity
	ZERO_REPOS_MIN_EVENTS: 20, // 0 repos but this many events = suspicious
	POINTS_ZERO_REPOS_ACTIVE: 20,

	// Activity density (events per day)
	ACTIVITY_DENSITY_HIGH: 8, // >= this events/day average
	ACTIVITY_DENSITY_EXTREME: 15, // >= this events/day average
	POINTS_HIGH_ACTIVITY_DENSITY: 15,
	POINTS_EXTREME_ACTIVITY_DENSITY: 25,

	HOURLY_ACTIVITY_HIGH: 50,
	HOURLY_ACTIVITY_EXTREME: 100,

	TIGHT_COMMIT_SECONDS: 60 * 10,
	TIGHT_COMMIT_THRESHOLD_GLOBAL: 70,
	POINTS_TIGHT_BURST: 25,

	// Rapid repo creation (filters CreateEvent by ref_type === "repository" only)
	CREATE_EVENTS_MIN: 5, // need at least this many repo creations to analyze
	CREATE_BURST_EXTREME: 16, // >= 16 repos created in 24 hours = extreme automation
	CREATE_BURST_HIGH: 8, // >= 8 repos created in 24 hours = suspicious
	POINTS_CREATE_BURST_EXTREME: 35,
	POINTS_CREATE_BURST_HIGH: 25,

	// 24/7 activity pattern (no sleep) - adjusted for fewer false positives
	HOURS_ACTIVE_EXTREME: 21, // activity across 21+ hours = suspicious (no realistic sleep)
	HOURS_ACTIVE_EXTREME_ESTABLISHED: 23, // stricter threshold for established accounts (23+ hours)
	EVENTS_PER_HOUR_MIN: 2.0, // minimum events per active hour for 24/7 pattern
	POINTS_24_7_ACTIVITY: 25,
	AGE_ESTABLISHED_ACCOUNT: 1000, // accounts older than this (days) use stricter thresholds

	// Event type diversity (bots have narrow activity)
	EVENT_TYPE_DIVERSITY_MIN: 2, // <= 2 event types = very limited diversity
	POINTS_LOW_DIVERSITY: 20,

	// Issue comment spam (multiple comments to different repos in short timeframe)
	ISSUE_COMMENT_SPAM_WINDOW_MINUTES: 2, // time window to group comments
	ISSUE_COMMENT_SPRAY_EXTREME: 15, // >= this different repos = comment spray bot
	ISSUE_COMMENT_SPRAY_HIGH: 10, // >= this different repos in short window = suspicious
	ISSUE_COMMENT_MIN_FOR_SPRAY: 10, // need at least this many comments to analyze
	POINTS_ISSUE_COMMENT_SPRAY_EXTREME: 40,
	POINTS_ISSUE_COMMENT_SPRAY_HIGH: 30,

	// PR comment spam (multiple review comments on different PRs/repos in short timeframe)
	PR_COMMENT_SPAM_WINDOW_MINUTES: 2, // time window to group PR comments
	PR_COMMENT_SPRAY_EXTREME: 12, // >= this different PRs = PR comment spam bot
	PR_COMMENT_SPRAY_HIGH: 8, // >= this different PRs in short window = suspicious
	PR_COMMENT_MIN_FOR_SPRAY: 8, // need at least this many PR comments to analyze
	POINTS_PR_COMMENT_SPRAY_EXTREME: 38,
	POINTS_PR_COMMENT_SPRAY_HIGH: 28,

	// Branch→PR temporal correlation (automated CI/CD workflow pattern)
	BRANCH_PR_TIME_WINDOW_SECONDS: 90, // PR must follow branch within this window
	BRANCH_PR_PATTERN_MIN_PAIRS: 8, // need at least this many correlated pairs to flag
	BRANCH_PR_PATTERN_MIN_PAIRS_ESTABLISHED: 15, // stricter threshold for established accounts
	BRANCH_PR_PATTERN_RATIO_MIN: 0.65, // >= 65% of branches must have matching PRs
	BRANCH_PR_PATTERN_RATIO_MIN_ESTABLISHED: 0.8, // stricter ratio for established (80%)
	BRANCH_PR_COUNT_RATIO_MIN: 0.65, // branches/PRs ratio must be >= this (low ratio = legitimate dev with many unrelated PRs)
	POINTS_BRANCH_PR_AUTOMATION: 35, // strong automation indicator

	// Rapid PR spam (multiple PRs to same repo in rapid succession - fork spam pattern)
	RAPID_PR_SPAM_MIN_PRS: 4, // need at least this many rapid successive PRs to flag (young accounts)
	RAPID_PR_SPAM_MIN_PRS_ESTABLISHED: 6, // stricter threshold for established accounts
	POINTS_RAPID_PR_SPAM: 40, // fork spam attack indicator

	// Closed PR spam (many PRs closed across different repos - rejected/unwanted contributions)
	CLOSED_PR_SPAM_MIN: 5, // need at least this many closed PRs to flag (young accounts)
	CLOSED_PR_SPAM_MIN_ESTABLISHED: 8, // stricter threshold for established accounts
	CLOSED_PR_REPO_SPREAD: 3, // minimum different repos for spray detection
	CLOSED_PR_TIME_WINDOW_MINUTES: 60, // PRs closed within this window = concentrated spray
	CLOSED_PR_MIN_DENSITY: 1, // minimum PRs per day average to flag spray pattern
	POINTS_CLOSED_PR_SPAM: 35, // base points for 5-24 closed PRs spread across repos
	POINTS_CLOSED_PR_SPAM_HIGH: 55, // 25-99 closed PRs = high volume rejected submissions
	POINTS_CLOSED_PR_SPAM_EXTREME: 75, // 100+ closed PRs = extreme volume ecosystem-wide spam
	POINTS_CLOSED_PR_SPAM_BURST_EXTREME: 80, // 100+ closed PRs in burst = coordinated attack

	// Limited community engagement (young accounts with zero engagement event types)
	POINTS_LIMITED_ENGAGEMENT: 25,

	// Organic signals (reduce score — genuine engagement patterns bots rarely exhibit)
	ORGANIC_ISSUE_MIN_COUNT: 3, // minimum issues filed to consider
	ORGANIC_ISSUE_MIN_REPOS: 2, // must span at least this many different repos
	ORGANIC_ISSUE_MIN_DAYS: 7, // must be spread over at least this many days
	POINTS_ORGANIC_ISSUE_ENGAGEMENT: 15, // bonus applied as negative penalty

	// Merged PR organic signal — getting code accepted by maintainers is a positive human indicator.
	// Points are intentionally conservative: automation bots can and do get PRs merged,
	// so this signal must not be able to rescue a heavily-flagged account on its own.
	ORGANIC_MERGED_PR_MIN: 3, // minimum merged PRs in foreign repos to grant any bonus
	ORGANIC_MERGED_PR_HIGH: 10, // threshold for elevated bonus
	ORGANIC_MERGED_PR_EXTREME: 25, // threshold for maximum bonus
	ORGANIC_MERGED_PR_MIN_RATE: 0.5, // merged / opened must be at least this to qualify
	ORGANIC_MERGED_PR_MIN_OPENED: 3, // minimum opened PRs needed to evaluate the rate
	POINTS_ORGANIC_MERGED_PR: 10, // 3–9 merged PRs
	POINTS_ORGANIC_MERGED_PR_HIGH: 20, // 10–24 merged PRs
	POINTS_ORGANIC_MERGED_PR_EXTREME: 30, // 25+ merged PRs

	// Watch/star farming (bulk starring of repos in a short time window)
	WATCH_SPAM_MIN_EVENTS: 10,
	WATCH_SPAM_WINDOW_HOURS: 24,
	WATCH_SPAM_REPOS_HIGH: 20, // >= 20 different repos starred in 24h = suspicious
	WATCH_SPAM_REPOS_EXTREME: 50, // >= 50 different repos starred in 24h = farming
	POINTS_WATCH_SPAM_HIGH: 20,
	POINTS_WATCH_SPAM_EXTREME: 35,

	// Comment-before-PR pattern
	// Flags accounts that comment on an issue and open a PR to the same repo
	// in an implausibly short time — not enough time to read, implement, and push.
	COMMENT_BEFORE_PR_VERY_FAST_MINUTES: 5, // comment→PR gap must be under this
	COMMENT_BEFORE_PR_VERY_FAST_MIN_REPOS: 2, // must occur across at least this many repos
	POINTS_COMMENT_BEFORE_PR_VERY_FAST: 30,

	// Bounty repository PR farming
	// Detects accounts whose opened PRs predominantly target known bounty program repos.
	// Matched against BOUNTY_REPO_PATHS (full owner/repo) and BOUNTY_REPO_NAMES (name-only,
	// to catch forks of known fake campaign repos not yet in the list).
	BOUNTY_REPO_MIN_PRS: 3, // need at least this many opened PRs to analyze
	BOUNTY_REPO_RATIO_HIGH: 0.75, // >= 75% of PRs to bounty repos = strong signal
	BOUNTY_REPO_RATIO_LOW: 0.4, // >= 40% of PRs to bounty repos = moderate signal
	BOUNTY_REPO_MERGE_RATE_CLEAN: 0.5, // >= 50% of closed bounty PRs merged = skip multiplier (legitimate contributor)
	BOUNTY_MULTIPLIER_HIGH: 1.3, // >= 75% bounty PR ratio — multiplies existing automation signals
	BOUNTY_MULTIPLIER_LOW: 1.15, // >= 40% bounty PR ratio or labeling activity — mild multiplier

	// AI commit metadata — multiplier, not a standalone signal
	// Applies only to flags marked `amplifiable: true` (automation/spam signals).
	// Tiers are evaluated highest-first; the first matching ratio wins.
	AI_COMMIT_MIN_COMMITS: 5,
	AI_COMMIT_TIERS: [
		{ ratio: 0.9, multiplier: 1.5 },
		{ ratio: 0.85, multiplier: 1.3 },
		{ ratio: 0.75, multiplier: 1.15 },
	],
} as const;
