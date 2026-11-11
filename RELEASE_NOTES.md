# Release notes

## Unreleased

The checks avoid several false positives on real developers and catch two
more kinds of automation, so some scores change.

### Fewer false positives

- Accounts that work mostly in one organization's repositories (an employer,
  or a project they help run) are no longer flagged for living on other
  people's repos (`zero-repos-external`, `mostly-external`,
  `external-contributor`), even without repos of their own.
- A full event list (GitHub's limit of 300 events) no longer reads as a
  dormant account waking up (`dormant-reactivation`). The short span only
  means the account is busy.
- `comment-pr-fast` only counts repositories where the account is an
  outsider. Maintainers and collaborators who answer an issue and open the fix
  right away are not flagged.
- `limited-engagement` needs at least 3 PRs to other people's repos. A first
  contribution is not a pattern.
- A repository name alone marks a bounty repo only when bounty campaigns copied
  it under several owners, like `zeroeye`. Contributors to real projects that
  fake campaigns copied, like `hashicorp/vault` or `traefik/traefik`, are no
  longer bounty hunters.

### More automation caught

- Coding around the clock for days (`coding-streak`, `coding-marathons`) is
  checked for accounts of any age, not only accounts younger than 90 days.
- Organic signals, like merged PRs, no longer pull an account the flags call
  automation back to looking human. The bonus counts in full until the flags
  alone reach automation, and fades after that.

### `identityConfig`

- Deprecated keys that no check uses: `POINTS_NO_IDENTITY`,
  `FOLLOW_RATIO_FOLLOWING_MIN`, `FOLLOW_RATIO_FOLLOWERS_MAX`,
  `POINTS_FOLLOW_RATIO`, `POINTS_ZERO_FOLLOWERS` and
  `ZERO_FOLLOWERS_MIN_AGE_DAYS`. They keep their old values and will be
  removed in v4.
- Deprecated `ACTIVITY_DENSITY_HIGH`, `ACTIVITY_DENSITY_EXTREME`,
  `POINTS_HIGH_ACTIVITY_DENSITY` and `POINTS_EXTREME_ACTIVITY_DENSITY`. Use
  `YOUNG_PRS_PER_DAY_HIGH` (4), `YOUNG_PRS_PER_DAY_EXTREME` (7.5),
  `POINTS_YOUNG_PR_VOLUME_HIGH` (20) and `POINTS_YOUNG_PR_VOLUME_EXTREME` (35)
  instead: the values the young account PR check really uses. The deprecated
  keys keep their old values, no check reads them, and they will be removed
  in v4.
- New keys for the new rules: `HOME_OWNER_MIN_SHARE`,
  `LIMITED_ENGAGEMENT_MIN_PRS` and `BOUNTY_CAMPAIGN_MIN_OWNERS`.
- New keys for thresholds that were written inline before, with the same
  values: `RAPID_PR_MAX_GAP_SECONDS`, `REST_GAP_NONE_HOURS`,
  `POINTS_24_7_NO_REST`, `MARATHON_HOUR_EVENNESS_MIN`,
  `FORK_RATE_MIN_SPAN_DAYS`, `FORK_COMBINED_MAX_PRS_PER_BRANCH`,
  `CLOSED_PR_BURST_MIN_REPOS` and `CLOSED_PR_SPIKE_DAY_MIN`.

## 3.0.0

`identify` is now `classify`, and it no longer depends on GitHub. It takes an
`account` and a list of `events` in its own shape, and a provider builds that
shape from a platform's data. The scoring is the same as in v2. `classify`
returns only the classification, and the details moved to `report` (see
below).

### Migrating from v2

#### 1. Rename `identify` to `classify` and wrap the GitHub data with `fromGitHub`

```diff
- import { identify } from "@unveil/identity";
+ import { classify } from "@unveil/identity";
+ import { fromGitHub } from "@unveil/identity/providers/github";

- const analysis = identify({ user, events });
+ const analysis = classify(fromGitHub({ user, events }));
```

#### 2. `classify` returns only the classification, `report` returns everything

`classify` returns `score`, `classification`, `confidence`, `isBountyHunter`
and `isGitHubApp`, and nothing else. Everything that led to the
classification (`flags`, `groups`, `window`, `timezone`, `profile`) comes from
`report`, in its own entry. If you only need the classification, the flag text
stays out of your bundle.

`report` takes the same input as `classify`, so you call one or the other:

```diff
+ import { report } from "@unveil/identity/report";

- const analysis = identify({ user, events });
+ const analysis = report(fromGitHub({ user, events }));

  analysis.score;          // works as before
  analysis.flags[0].label; // works as before
```

Flags have two new fields: `id`, and `facts` (the numbers the check measured).
`describeFlag(flag)` gives the text for a single flag.

#### 3. Renamed and moved exports

| v2                                                                                          | v3                                                 |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `identify`                                                                                  | `classify`                                         |
| `IdentifyResult` type                                                                       | `Classification`                                   |
| `IdentityClassification` type                                                               | `ClassificationLabel`                              |
| `IdentifyUser` type                                                                         | `Account`                                          |
| `IdentifyOptions` type                                                                      | `AccountInput`                                     |
| `IdentifyFlag` type                                                                         | `Flag` from `@unveil/identity/report`              |
| `getClassificationDetails` from the root                                                    | `@unveil/identity/report`                          |
| `isGitHubAppAccount` from the root                                                          | `@unveil/identity/providers/github`                |
| `GitHubUser`, `GitHubEvent` types                                                           | `@unveil/identity/providers/github`                |
| `FlagDataPoint` type                                                                        | `@unveil/identity/report`                          |
| `EventConnection`, `EvidenceGroup`, `ScoredGroup`, `WindowInfo`, `TimezoneEstimate` types   | `@unveil/identity/report`                          |
| `scoreFlags`, `analyzeWindow`, `calculateConfidence`, `estimateUtcOffset`                   | Removed. `report` returns their results            |
| `ScoreOptions`, `ScoreResult` types                                                         | Removed                                            |

#### 4. Removed options

AI commit metadata detection and `excludeRepos` were removed, because no one
used them.

- `commits` and AI commit detection are gone, along with the `ai-commits` flag.
- `excludeRepos` is gone. To leave repositories out, filter `events` before
  calling `classify`.

#### 5. Original events

Each event in a report's `flag.events` is now an `ActivityEvent`. The
original GitHub event is in `event.source`.

### Other changes

- Use your own data: pass `{ account, events }` directly to `classify`, without
  a provider. See the `ActivityEvent` type.
- `dayjs` was removed, so the bundle is smaller.
- New types: `ActivityEvent`, `ActivityEventType` and `AccountInput` from the
  root. `Report`, `ReportFlag`, `FlagId` and `FlagFacts` from
  `@unveil/identity/report`.
