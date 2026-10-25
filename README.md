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

### Flags and their text

Each flag has an `id`, its `points`, its `group`, the `events` behind it, and
`facts`: the numbers the check measured. There is no text in it, so the main
bundle stays small:

```js
// {
//   id: "fork-spike",
//   points: 51,
//   group: "fork",
//   facts: { forks: 12, totalForks: 14 },
//   events: [...],
// }
```

To show flags to people, add the text with `explain`. It comes from its own
entry, so the text is only in your bundle when you import it:

```js
import { identify } from "@unveil/identity";
import { explain, getClassificationDetails } from "@unveil/identity/explain";

const analysis = explain(identify(fromGitHub({ user, events })));

analysis.flags[0];
// {
//   ...the same flag,
//   label: "Fork spike detected",
//   detail: "Burst of 12 fork events in a single 24-hour window",
//   data: [
//     { label: "Forks in 24h window", value: 12, threshold: 8 },
//     { label: "Total forks observed", value: 14 },
//   ],
// }

getClassificationDetails(analysis.classification);
// { label: "Organic activity", description: "No automation signals detected in the analyzed events." }
```

`explainFlag(flag)` does the same for a single flag. The `FlagFacts` type lists
the facts of every flag id.

### Input

`identify` does not depend on any platform. It takes an `account` and a list of
`events` in its own small shape. A provider turns a platform's data into that
shape. There is a provider for GitHub.

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
data, so results for other platforms are not calibrated yet.

### Issues and feature requests

Please drop an issue if you find something that doesn't work, or have an idea for something that works better.
