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
import { fromGitHub } from "@unveil/identity/providers/github";

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
const analysis = identify(fromGitHub({ user, events }));

console.log(analysis);
// Output:
// {
//   classification: "organic",   // organic | mixed | automation | insufficient-data
//   score: 100,                  // 100 = human, 0 = automation
//   confidence: 0.83,            // 0-1: how sure we are about the result
//   isGitHubApp: false,          // true = a GitHub App account, not a person
//   flags: [],
//   groups: [],                  // how much each group took off the score
//   window: {                    // the events we looked at
//     eventCount: 100,
//     spanDays: 46.2,
//     saturated: false,          // true = the platform capped the list, counts are minimums
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

`identify` does not depend on any platform. It takes an `account` and a list of
`events` in its own small shape. A provider turns a platform's data into that
shape. There are providers for GitHub, GitLab, Codeberg and Tangled.

#### GitHub

`fromGitHub({ user, events, commits })` takes the GitHub API responses as they
are:

- `user` is the `GET /users/{username}` response. The checks read `login`,
  `created_at`, `public_repos` and `type`. `id`, `name`, `bio`, `avatar_url`,
  `html_url`, `followers` and `following` are passed on to the account, for
  showing the profile.
- `events` is the `GET /users/{username}/events` response.
- `commits` is optional. It is a list of `{ sha, message, repo }`, and turns on
  AI commit detection.

You can also pass smaller objects built from your own database. The
`GitHubUser` and `GitHubEvent` types list the fields that are read.

To ignore some repositories, add `excludeRepos` (a list of `owner/repo`):

```js
identify({ ...fromGitHub({ user, events }), excludeRepos: ["me/dotfiles"] });
```

Each flag lists the events behind it. Every event keeps the original GitHub
event in `source`.

#### GitLab

```js
import { fromGitLab } from "@unveil/identity/providers/gitlab";

identify(fromGitLab({ user, events, projects, publicRepos }));
```

- `user` is the `GET /users/:id` response. `bot` marks the account as an app.
- `events` is the `GET /users/:id/events` response.
- `publicRepos` is required, because GitLab's user has no project count. Read
  the `X-Total` header of `GET /users/:id/projects`.
- `projects` is a list of `{ id, path_with_namespace }`, for the projects the
  events happened in. GitLab events only carry a `project_id`. Without the
  projects, repos are named by their id, and the checks can't tell the user's
  own projects from other people's.

Merged merge requests (`accepted` in GitLab) become `merged`. Only opening a
merge request marks the user as its author, since GitLab events only say who
acted.

#### Codeberg

```js
import { fromCodeberg } from "@unveil/identity/providers/codeberg";

identify(fromCodeberg({ user, events, publicRepos }));
```

This works for any Forgejo or Gitea server, not just Codeberg.

- `user` is the `GET /api/v1/users/{username}` response.
- `events` is the `GET /api/v1/users/{username}/activities/feeds?only-performed-by=true`
  response. Activities by other people are left out either way.
- `publicRepos` is required, because the user has no repo count. Read the
  `X-Total-Count` header of `GET /api/v1/users/{username}/repos`.

#### Tangled

```js
import { fromTangled } from "@unveil/identity/providers/tangled";

identify(
  fromTangled({
    account: { did, handle, createdAt },
    records,
  }),
);
```

- `account.createdAt` is required, because Tangled keeps no sign-up date. Use
  the first entry of the DID's PLC audit log, or the `createdAt` of the
  account's Bluesky profile.
- `records` are the account's `sh.tangled.*` records, as
  `com.atproto.repo.listRecords` or the AppView's `list*By` queries return them
  (`{ uri, value }`), plus the `sh.tangled.git.refUpdate` records it pushed.
  `publicRepos` is the number of `sh.tangled.repo` records in there.
- Issues and pulls point at a repo DID, not a name. To name those repos, also
  pass the repo, issue and pull records they point at. Records by other
  accounts are only used to look up names, and never count as activity.

#### Your own data

You can also build the input yourself:

```js
identify({
  account: { login: "octocat", createdAt: "2020-01-01T00:00:00Z", publicRepos: 8 },
  events: [
    { type: "push", at: "2026-05-01T10:00:00Z", repo: "octocat/hello" },
    {
      type: "pull-request",
      action: "opened",
      at: "2026-05-01T10:05:00Z",
      repo: "someone/project",
      pullRequest: { number: 12, isAuthor: true },
    },
  ],
});
```

See the `IdentifyEvent` type for every field. The scoring was tuned on GitHub
data, so results for GitLab, Codeberg, Tangled and other platforms are not
calibrated yet.

### Issues and feature requests

Please drop an issue if you find something that doesn't work, or have an idea for something that works better.
