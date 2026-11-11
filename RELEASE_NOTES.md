# Release notes

## 3.1.0

Maintainers, newcomers and busy developers are flagged less often. More
automation is detected: coding around the clock is now checked on accounts of
any age, not only new ones, and merged PRs no longer raise the score of
accounts with strong automation flags.

### Fewer false positives

- **People who work in one organization's repos.** Someone who contributes
  mostly to their employer's repos, or to a project they help run, is no
  longer flagged for only working on other people's repos. This holds even
  when they have no repos of their own. Flags: `zero-repos-external`,
  `mostly-external`, `external-contributor`.
- **Very busy accounts.** GitHub returns at most 300 events, so for a busy
  account all of them can fall within a few days. That short window used to
  look like an old account that suddenly woke up. It no longer does. Flag:
  `dormant-reactivation`.
- **Maintainers who fix issues quickly.** Commenting on an issue and opening
  a PR right after is only a signal from an outsider. It no longer counts
  in repos where the account is a maintainer or collaborator. Flag:
  `comment-pr-fast`.
- **First-time contributors.** A newcomer who opens one or two PRs and does
  nothing else is no longer flagged. It now takes at least 3 PRs to other
  people's repos. Flag: `limited-engagement`.
- **Contributors to projects that bounty campaigns copied.** Some bounty
  campaigns copy real repos, like `hashicorp/vault` or `traefik/traefik`.
  Working on the real project no longer makes an account a bounty hunter. A
  repo name alone now marks a bounty repo only when it appears under several
  different owners, like `zeroeye`.

### More automation detected

- **Coding around the clock is checked for every account.** Coding evenly
  through 16 or more hours a day, several days in a row or many days in a
  few weeks, used to be checked only on accounts younger than 90 days. Now it
  is checked on accounts of any age. Flags: `coding-streak`,
  `coding-marathons`.
- **Merged PRs no longer hide strong automation signals.** Organic signals,
  like merged PRs, raise the score. They still count in full for accounts
  with weak flags. Automated activity gets PRs merged too, though, so for
  accounts whose flags point to automation the bonus gets smaller as the
  flags get stronger, until it disappears.

### `identityConfig`

This only matters if your code reads values from `identityConfig`.

**Deprecated keys.** They still exist with their old values, but no check
uses them, and they will be removed in v4.

| Deprecated key                    | Use instead                           |
| --------------------------------- | ------------------------------------- |
| `ACTIVITY_DENSITY_HIGH`           | `YOUNG_PRS_PER_DAY_HIGH` (4)          |
| `ACTIVITY_DENSITY_EXTREME`        | `YOUNG_PRS_PER_DAY_EXTREME` (7.5)     |
| `POINTS_HIGH_ACTIVITY_DENSITY`    | `POINTS_YOUNG_PR_VOLUME_HIGH` (20)    |
| `POINTS_EXTREME_ACTIVITY_DENSITY` | `POINTS_YOUNG_PR_VOLUME_EXTREME` (35) |
| `POINTS_NO_IDENTITY`              | Nothing, no check uses it             |
| `FOLLOW_RATIO_FOLLOWING_MIN`      | Nothing, no check uses it             |
| `FOLLOW_RATIO_FOLLOWERS_MAX`      | Nothing, no check uses it             |
| `POINTS_FOLLOW_RATIO`             | Nothing, no check uses it             |
| `POINTS_ZERO_FOLLOWERS`           | Nothing, no check uses it             |
| `ZERO_FOLLOWERS_MIN_AGE_DAYS`     | Nothing, no check uses it             |

The replacements hold the values the young account PR check really uses.
The old keys never matched them.

**New keys.**

- For the new rules: `HOME_OWNER_MIN_SHARE`, `LIMITED_ENGAGEMENT_MIN_PRS`
  and `BOUNTY_CAMPAIGN_MIN_OWNERS`.
- For values that were hard-coded inside checks, with the same values as
  before: `RAPID_PR_MAX_GAP_SECONDS`, `REST_GAP_NONE_HOURS`,
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
