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
const analysis = identify({
  createdAt: user.created_at,
  reposCount: user.public_repos,
  accountName: user.login,
  events,
});

console.log(analysis);
// Output:
// {
//   classification: "organic",
//   score: 100,
//   flags: []
// }
```

### AI-Enhanced Analysis

For deeper analysis, you can use the `getAIAnalysis` function to run the heuristic results through an LLM via [GitHub Models](https://github.com/marketplace/models). This provides a confidence score and natural language reasoning on top of the rule-based classification.

```js
import { identify } from "@unveil/identity";
import { getAIAnalysis } from "@unveil/identity/ai";

const analysis = identify({
  createdAt: user.created_at,
  reposCount: user.public_repos,
  accountName: user.login,
  events,
});

const aiResult = await getAIAnalysis({
  token: process.env.GITHUB_TOKEN,
  model: "openai/gpt-4o",
  username: user.login,
  analysis,
  accountCreatedAt: user.created_at,
  publicRepos: user.public_repos,
  events,
});

console.log(aiResult);
```

`getAIAnalysis` accepts any model available on GitHub Models (e.g. `openai/gpt-4o`, `deepseek/DeepSeek-R1`). It returns `null` if the model produces no usable response.

**tested models**:
- openai/gpt-4o-mini
- deepseek/DeepSeek-R1
- openai/gpt-4o **(unreliable)**


### Issues and feature requests

Please drop an issue if you find something that doesn't work, or have an idea for something that works better.
