# Release notes

## 3.0.0

`identify` no longer depends on GitHub. It takes an `account` and a list of
`events` in its own shape, and a provider builds that shape from a platform's
data. The scoring is the same as in v2. `identify` now returns only the
verdict, and the details moved to `report` (see below).

### Migrating from v2

#### 1. Wrap the GitHub data with `fromGitHub`

```diff
  import { identify } from "@unveil/identity";
+ import { fromGitHub } from "@unveil/identity/providers/github";

- const analysis = identify({ user, events });
+ const analysis = identify(fromGitHub({ user, events }));
```

#### 2. `identify` returns only the verdict, `report` returns everything

`identify` now returns `score`, `classification`, `confidence`,
`isBountyHunter` and `isGitHubApp`, and nothing else. Everything that led to
the verdict (`flags`, `groups`, `window`, `timezone`, `profile`) comes from
`report`, in its own entry. If you only need the verdict, the flag text stays
out of your bundle.

`report` takes the same input as `identify`, so you call one or the other:

```diff
+ import { report } from "@unveil/identity/report";

- const analysis = identify({ user, events });
+ const analysis = report(fromGitHub({ user, events }));

  analysis.score;          // works as before
  analysis.flags[0].label; // works as before
```

Flags have two new fields: `id`, and `facts` (the numbers the check measured).
`describeFlag(flag)` gives the text for a single flag.

#### 3. Moved exports

| v2                                                                                                        | v3                                      |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `getClassificationDetails` from the root                                                                  | `@unveil/identity/report`               |
| `isGitHubAppAccount` from the root                                                                        | `@unveil/identity/providers/github`     |
| `GitHubUser`, `GitHubEvent` types                                                                         | `@unveil/identity/providers/github`     |
| `IdentifyUser` type                                                                                       | `IdentifyAccount`                       |
| `IdentifyOptions` type                                                                                    | `IdentifyInput`                         |
| `FlagDataPoint` type                                                                                      | `@unveil/identity/report`               |
| `IdentifyFlag`, `EventConnection`, `EvidenceGroup`, `ScoredGroup`, `WindowInfo`, `TimezoneEstimate` types | `@unveil/identity/report`               |
| `scoreFlags`, `analyzeWindow`, `calculateConfidence`, `estimateUtcOffset`                                 | Removed. `report` returns their results |
| `ScoreOptions`, `ScoreResult` types                                                                       | Removed                                 |

#### 4. Removed options

AI commit metadata detection and `excludeRepos` were removed, because no one
used them.

- `commits` and AI commit detection are gone, along with the `ai-commits` flag.
- `excludeRepos` is gone. To leave repositories out, filter `events` before
  calling `identify`.

#### 5. Original events

Each event in a report's `flag.events` is now an `IdentifyEvent`. The
original GitHub event is in `event.source`.

### Other changes

- Use your own data: pass `{ account, events }` directly to `identify`, without
  a provider. See the `IdentifyEvent` type.
- `dayjs` was removed, so the bundle is smaller.
- New types: `IdentifyEvent`, `IdentifyEventType` and `IdentifyInput` from the
  root. `IdentityReport`, `ReportFlag`, `FlagId` and
  `FlagFacts` from `@unveil/identity/report`.
