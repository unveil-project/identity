# Release notes

## 3.0.0

`identify` no longer depends on GitHub. It takes an `account` and a list of
`events` in its own shape, and a provider builds that shape from a platform's
data. The scoring is the same as in v2, and so is the result, except for the
flags (see below).

### Migrating from v2

#### 1. Wrap the GitHub data with `fromGitHub`

```diff
  import { identify } from "@unveil/identity";
+ import { fromGitHub } from "@unveil/identity/providers/github";

- const analysis = identify({ user, events, commits });
+ const analysis = identify(fromGitHub({ user, events, commits }));
```

`excludeRepos` still goes to `identify`:

```js
identify({ ...fromGitHub({ user, events }), excludeRepos: ["me/dotfiles"] });
```

#### 2. Flag text moved to `explain`

Flags no longer have `label`, `detail` and `data`. They have an `id` and
`facts` (the numbers the check measured). The text lives in its own entry, so
if you only need the score and classification, it stays out of your bundle and
the package is much lighter. To get the text back, use `explain`:

```diff
+ import { explain } from "@unveil/identity/explain";

- const analysis = identify({ user, events });
+ const analysis = explain(identify(fromGitHub({ user, events })));

  analysis.flags[0].label; // works as before
```

`explainFlag(flag)` does the same for a single flag.

#### 3. Moved exports

| v2                                          | v3                                                          |
| ------------------------------------------- | ----------------------------------------------------------- |
| `getClassificationDetails` from the root    | `@unveil/identity/explain`                                  |
| `isGitHubAppAccount` from the root          | `@unveil/identity/providers/github`                         |
| `GitHubUser`, `GitHubEvent` types           | `@unveil/identity/providers/github`                         |
| `IdentifyUser` type                         | `IdentifyAccount`                                           |
| `FlagDataPoint` type                        | `@unveil/identity/explain`                                  |

#### 4. Original events

Each event in `flag.events` is now an `IdentifyEvent`. The original GitHub
event is in `event.source`.

### Other changes

- Use your own data: pass `{ account, events }` directly to `identify`, without
  a provider. See the `IdentifyEvent` type.
- `dayjs` was removed, so the bundle is smaller.
- New types: `FlagId`, `FlagFacts`, `IdentifyEvent`, `IdentifyEventType`,
  `IdentifyInput`, `IdentifyCommit`.
