# Release notes

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
