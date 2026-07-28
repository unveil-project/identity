# identity

Identify automation patterns in GitHub accounts through behavioral analysis

This is the core logic behind [AgentScan](https://agentscan.netlify.app), a tool for analyzing GitHub account behavior to detect potential AI agents and automated activity.

Built in response to [increasing reports](https://socket.dev/blog/ai-agent-lands-prs-in-major-oss-projects-targets-maintainers-via-cold-outreach) of AI agents targeting open source projects through automated contributions and cold outreach.

It applies an opinionated scoring system to GitHub activity signals to classify accounts as organic, mixed, or automation. The results are indicators, not verdicts.

### Install

```bash
npm install @unveil/identity
```

### Usage

```js
import { identify } from "@unveil/identity";

// Fetch user data from GitHub API
const username = "github_account_username";
const userRes = await fetch(`https://api.github.com/users/${username}`);
const user = await userRes.json();

// Fetch user's recent events
const eventsRes = await fetch(
  `https://api.github.com/users/${username}/events?per_page=100`
);
const events = await eventsRes.json();

// Analyze the account
const analysis = identify({ user, events });

console.log(analysis);
// Output:
// {
//   classification: "organic",   // organic | mixed | automation | insufficient-data
//   score: 100,                  // 100 = human, 0 = automation
//   confidence: 0.83,            // 0-1: how sure we are about the result
//   flags: [],
//   groups: [],                  // how much each group took off the score
//   window: {                    // the events we looked at
//     eventCount: 184,
//     spanDays: 46.2,
//     saturated: false,          // true = GitHub capped the list, counts are minimums
//     firstEventAt: "...",
//     lastEventAt: "...",
//   },
//   timezone: {                  // guessed from when the account is active
//     offsetHours: 3,
//     confidence: 0.59,          // near 0 means it is active at all hours
//   },
//   profile: { age: 1204, repos: 37 },
// }
```

### Input

`user` is the `GET /users/{username}` response. Only `login`, `created_at` and
`public_repos` are needed. If `followers`, `following`, `bio`, `blog`, `company`,
`location`, `email` or `twitter_username` are there, some extra checks turn on.
If they are missing, those checks are skipped — nothing is penalised for data you
did not fetch. So you can also pass a smaller object built from your own
database.

`events` is the `GET /users/{username}/events` response.

Two more options: `excludeRepos` (a list of `owner/repo` to ignore) and `commits`
(to turn on AI commit detection).

### Scoring

Each check takes points off a starting score of 100 (100 = human, 0 = automation).

Checks are not independent. One burst of forking, or one week of PR spam, sets
off several checks that are all about the same behaviour. If we added them all
up, a single behaviour could take off hundreds of points on its own.

So every flag belongs to a **group**. Inside a group only the biggest flag counts
fully, and the others count for 25%. Different groups are about different things,
so those still add up.

`result.groups` shows this: `rawPoints` is what you get by adding everything up,
and `points` is what the group really took off.

Points also slide between the listed thresholds instead of jumping. At a
threshold you get exactly the configured points; between two thresholds you get
something in between. One extra fork can no longer double a penalty.

### How time is handled

The result does not depend on when you run the check. Time windows are found by
looking for the busiest stretch anywhere in the data, not by counting back from
today, so an old burst of activity cannot slip out of view.

Hours and days are read in the account's own local time, which we guess from when
it is usually active. Reading them in UTC would split the working day of anyone
outside UTC across two dates.

### When there is not enough data

An account with very little activity comes back as `insufficient-data`, not
`organic`. Seeing no automation signals in a nearly empty event list tells you
nothing — it is missing evidence, not a clean result. `confidence` says how much
evidence there was.

Accounts that set off real automation checks are still reported as `mixed` or
`automation`, even with few events.

### Detection Heuristics

The system analyzes GitHub activity across **53 heuristics** (51 scoring, 2 informational), grouped into the groups used by the scorer.

#### Account Age (`account-age`)
1. **Recently created** - Account < 30 days old
2. **Young account** - Account 30-90 days old
3. **Activity inconsistent with account age** - An account over a year old, with almost no repos, where everything we can see happened inside a few weeks. Old accounts can be bought, so an old sign-up date on its own is not proof of a real history

A flagged account also loses the softer thresholds that old accounts normally
get.

#### Profile (`profile`)
Only run for the fields present on the user object.

4. **Unreciprocated follow pattern** - Following many accounts, followed by almost none
5. **No followers** - Zero followers after 90+ days
6. **No profile identity** - No bio, blog, company, location, email or linked social account

#### External Focus (`external-focus`)
7. **Only active on other people's repos** - 0 personal repos but all activity is external
8. **Primarily external contributions** - Many PRs but few/no personal repos
9. **Mostly external activity** - High % of activity on others' repos

#### Repository Creation (`repo-creation`)
10. **Concentrated repository creation** - 16+ repos created in 24 hours
11. **Frequent repository creation** - 8-15 repos created in 24 hours

#### Activity Timing & Sleep Patterns (`timing`)
12. **24/7 activity pattern** - Any 24 hours with activity in 21+ different hours and under 3 hours of rest. We slide the window over real events, so it does not matter where UTC midnight falls
13. **High push frequency** - Many consecutive same-repo pushes within minutes of each other
14. **Extended daily coding** - Consecutive marathon days (16+ hours), in local time
15. **Frequent long coding days** - Multiple days with 16+ hours and uniform hourly distribution

#### Event Type Diversity (Shannon Entropy) (`diversity`)
16. **Narrow activity focus** - 3 or fewer event types, low entropy (< 0.8), and no comments or reviews

#### Rapid Comment Activity (`comment-volume`, `pr-comment-volume`)
17. **Rapid comments across repositories** - 15+ distinct repos in a concentrated window
18. **High comment frequency across repos** - 10-14 distinct repos in a concentrated window
19. **Rapid PR review comments** - 12+ distinct PRs in a concentrated window
20. **High PR comment frequency** - 8-11 distinct PRs in a concentrated window

#### Star Farming (`watch`)
21. **Very high starring rate** - 50+ repos starred within 24 hours
22. **High starring rate** - 20-49 repos starred within 24 hours

#### Branch/PR Timing (`branch-pr`)
23. **Rapid branch→PR pattern** - Near 1:1 ratio with branches consistently followed by PRs within a short window (suspicious timing, not conclusive proof of automation — a quick manual push-then-PR workflow can also trigger this)
24. **Rapid fork→PR pattern** - Same, matched across a fork and its upstream
25. **Rapid PRs to repository** - Multiple PRs opened to one repo seconds apart

#### PR Outcomes (`pr-outcome`)
26. **Closed PRs across many repositories** - Contributions closed unmerged across many repos at significant density
27. **Concentrated PR closures** - Many closures across repos inside a single hour

#### Fork Patterns (`fork`)
28. **Multiple forks** - 5-7 forks in 24 hours
29. **Fork spike detected** - 8-19 forks in 24 hours
30. **Severe fork surge** - 20-34 forks in 24 hours
31. **Extreme fork automation** - 35+ forks in 24 hours
32. **Multi-day fork surge** - Concentrated activity over 48 hours
33. **Severe multi-day fork surge** - Rapid burst over 72 hours
34. **Sustained fork rate** - High forks/day over 3+ days
35. **Extended forking pattern** - Forking on multiple consecutive days
36. **Fork scatter pattern** - Targeting many different repositories
37. **Chained automation pattern** - Fork → Branch → PR sequence with temporal ordering

#### PR Volume (`pr-volume`)
All windows are the densest window found anywhere in the data.

38. **Very high PR volume** - High PRs/day ratio (young accounts)
39. **High PR volume** - Moderate PRs/day ratio (young accounts)
40. **High PR volume in a 24-hour window** - Burst of PRs to external repos
41. **High PR volume in a 7-day window** - Weekly PR surge to external repos
42. **Very high PR volume (daily)** - 30+ PRs in 24 hours
43. **Very high PR volume (weekly)** - 100+ PRs in 7 days
44. **High PR volume (weekly)** - 50+ PRs in 7 days
45. **Distributed PR pattern** - High PR count across many repos at high density

#### Repository Spread (`repo-spread`)
46. **Highly distributed activity** - 30+ external repos (young accounts)
47. **Distributed activity** - 20-29 external repos (young accounts)

#### Community Engagement (`engagement`)
48. **Limited community engagement** - External code contributions with no issue, comment, review or star activity

#### Comment-to-PR Temporal Patterns (`comment-pr-timing`)
49. **Issue comment and PR within minutes** - Issue comment followed by a PR to the same repo within 5 minutes, across 2+ repositories

#### Bounty Repository Activity (`bounty`)
50. **PR activity in known bounty program repositories** - 40%+ of opened PRs target known bounty repos. Reported for context and used as a multiplier on other automation signals; carries no points of its own
51. **Bounty infrastructure activity** - 3+ bounty-labelled issues in known bounty repos

#### AI Attribution (`ai-attribution`)
52. **AI agent branch naming pattern** - 50%+ of branches use known agent prefixes
53. **Predominantly AI-attributed commits** - Requires `commits`. Carries no points of its own; acts as a multiplier on automation signals

### Issues and feature requests

Please drop an issue if you find something that doesn't work, or have an idea for something that works better.
