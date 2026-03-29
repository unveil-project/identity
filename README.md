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

const user = {}; // <-- `https://api.github.com/users/${username}`
const events = []; // <-- `https://api.github.com/users/${username}/events?per_page=100`

const analysis = identify({
  createdAt: user.created_at,
  reposCount: user.public_repos,
  accountName: user.login,
  events,
});
```

### Issues and feature requests

Please drop an issue if you find something that doesn't work, or have an idea for something that works better.
