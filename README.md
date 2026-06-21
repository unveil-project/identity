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

### Detection Heuristics

The system analyzes GitHub activity across **44 distinct heuristics** organized into 11 categories. Each heuristic assigns points that are subtracted from a baseline score of 100 (100 = human, 0 = automation).

#### Account Characteristics
1. **Recently created** - Account < 30 days old
2. **Young account** - Account 30-90 days old

#### Repository Patterns
3. **Only active on other people's repos** - 0 personal repos but all activity is external
4. **Concentrated repository creation** - 16+ repos created in 24 hours
5. **Frequent repository creation** - 8-15 repos created in 24 hours

#### Activity Timing & Sleep Patterns
6. **24/7 activity pattern** - Single day with activity across many hours and < 3 hour sleep window (per-day analysis only)

#### Event Type Diversity (Shannon Entropy Analysis)
7. **Narrow activity focus** - Either:
   - ≤3 event types with low entropy (< 0.8) AND no human interactions, OR
   - ≥5 event types with very high entropy (> 0.85) AND no human interactions

#### Rapid Comment Activity
8. **Rapid comments across repositories** - 15+ distinct repos in concentrated time window
9. **High comment frequency across repos** - 10-14 distinct repos in concentrated time window
10. **Rapid PR review comments** - 12+ distinct PRs in concentrated time window
11. **High PR comment frequency** - 8-11 distinct PRs in concentrated time window

#### Branch/PR Automation
12. **Automated branch/PR workflow** - Near 1:1 ratio with branches consistently followed by PRs within time window

#### Fork Patterns (Multiple Time Windows)
13. **Multiple forks** - 5-7 forks in 24 hours
14. **Fork spike detected** - 8-19 forks in 24 hours
15. **Severe fork surge** - Variable thresholds in 24h
16. **Extreme fork automation** - 20+ forks in 24 hours
17. **Multi-day fork surge** - Concentrated activity over 48 hours
18. **Severe multi-day fork surge** - Rapid burst over 72 hours
19. **Sustained fork rate** - High forks/day over 3+ days
20. **Extended forking pattern** - Forking activity on multiple consecutive days
21. **Fork scatter pattern** - Targeting many different repositories
22. **Suspicious chained automations** - Fork → Branch → PR sequence with temporal ordering

#### Young Account Specific Patterns
23. **Extreme commit burst** - Many commits in 1 hour
24. **High commit burst** - Moderate commits in 1 hour
25. **High commit frequency** - Tight bursts within seconds
26. **Very high PR volume** - High PRs/day ratio
27. **High PR volume** - Moderate PRs/day ratio
28. **Extended daily coding** - Consecutive marathon days (15+ hours)
29. **Frequent long coding days** - Multiple days with 15+ hours and uniform hourly distribution
30. **Highly distributed activity** - Activity across many external repos
31. **Distributed activity** - Activity across external repos
32. **High PR volume in the past 24 hours** - Burst of PRs to external repos
33. **High PR volume during last week** - Weekly PR surge to external repos
34. **Primarily external contributions** - Many PRs but few/no personal repos
35. **Mostly external activity** - High % of activity on others' repos

#### High Volume PR Patterns
36. **Very high PR volume (daily)** - 30+ PRs in 24 hours
37. **Very high PR volume (weekly)** - 100+ PRs in 7 days
38. **High PR volume (weekly)** - 50+ PRs in 7 days
39. **Distributed PR pattern** - High PR count across many repos with high density OR 30-day window

#### Bounty Repository Activity
40. **High PR activity in bounty repositories** - 75%+ of opened PRs target known bounty program repositories
41. **PR activity in bounty repositories** - 40-74% of opened PRs target known bounty program repositories
42. **Issue activity in bounty repositories** - 3+ issue labeling events in known bounty program repositories

#### Comment-to-PR Temporal Patterns
43. **Comment-before-PR pattern** - Issue comment on a repo followed by a PR to the same repo within 5 minutes, repeated across 2+ repositories
44. **Comment-before-PR pattern (wide)** - Same pattern across 4+ repositories

### Issues and feature requests

Please drop an issue if you find something that doesn't work, or have an idea for something that works better.
