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
//   isGitHubApp: false,          // true = a GitHub App account, not a person
//   flags: [],
//   groups: [],                  // how much each group took off the score
//   window: {                    // the events we looked at
//     eventCount: 100,
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

### GitHub Apps

Accounts like `coderabbitai[bot]` or `dependabot[bot]` are GitHub Apps, and
GitHub says so itself: `GET /users/{username}` returns `type: "Bot"` for them.
That value (or the reserved `[bot]` login suffix, if you did not fetch the
type) sets `isGitHubApp` on the result. 

```js
if (analysis.isGitHubApp) {
  // known automation, by declaration rather than by behaviour
}
```


### Issues and feature requests

Please drop an issue if you find something that doesn't work, or have an idea for something that works better.
