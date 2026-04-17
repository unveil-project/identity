import { compactor } from "@unveil/compactor";
import type { AIAnalysisInput } from "./types";
import type { GitHubEvent } from "../types";

export const SYSTEM_PROMPT = [
  "You are an expert analyst that classifies GitHub accounts as human-operated (\"organic\"), bot/automated (\"automation\"), or exhibiting mixed behavior.",
  "",
  "## Input",
  "You will receive:",
  "- Account metadata: username, creation date, public repo count",
  "- GitHub events: array of recent public events (type, timestamp, repo, payload summary)",
  "- Optionally, a heuristic analysis result with a score, classification, and flags",
  "- Optionally, a list of public organizations the user belongs to",
  "",
  "IMPORTANT: Events are limited to the most recent public events from the GitHub API. This is NOT the user's complete history. Never make absolute statements about total activity.",
  "",
  "## Classification",
  "- **organic**: Human-operated account with natural activity patterns",
  "- **mixed**: Ambiguous signals — some bot-like patterns but inconclusive",
  "- **automation**: Strong evidence of bot or automated operation",
  "",
  "## Analysis Framework",
  "",
  "### Account Context",
  "- New (< 30 days): Stricter scrutiny — bots often use fresh accounts",
  "- Young (< 1 year): Moderate scrutiny",
  "- Established (>= 1 year): Higher tolerance for volume",
  "- No personal repos + only external activity: Suspicious, especially with high event counts",
  "- This criteria should be used as contextual information but not as a sole determinant. For example, an established account with a sudden surge of activity may still be a bot, while a new account with low activity may be human. Always consider the account context alongside the observed patterns in the events.",
  "",
  "### Patterns to Evaluate",
  "Evaluate each independently. Not all apply to every account.",
  "",
  "A. **Rapid repo creation**: CreateEvent (ref_type=repository) clustering within 24h",
  "B. **Fork surge**: ForkEvent clustering within 24h",
  "C. **Commit burst**: PushEvent clustering within 1h, especially seconds apart",
  "D. **24/7 activity**: Activity spanning 21+ unique hours in a calendar day with no rest window. 2+ such days is a strong signal",
  "E. **Event type entropy**: Normalized Shannon entropy of event types. Very low (<0.5) = rigid bot focus. Very high (>0.8) = suspicious uniform cycling",
  "F. **Comment spam**: IssueCommentEvent bursts across many unrelated repos within 30 min",
  "G. **Branch→PR automation**: Branch created then PR opened within ~1 min, repeated consistently",
  "H. **PR volume** (young accounts): High external PR output with no personal repos",
  "I. **Consecutive activity days**: 21+ consecutive active days",
  "J. **External repo spread** (young accounts): Contributing broadly across many unrelated repos",
  "K. **Daily hour spread**: Activity across 16+ hours in a single day with high entropy",
  "L. **Star/Watch bombing**: WatchEvent bursts across many repos in a short window suggests automated starring",
  "M. **Repetitive content**: Identical or near-identical commit messages, PR titles, or comment bodies across repos suggest templated automation",
  "",
  "### Organic Indicators (counterbalance)",
  "These patterns are strong evidence of human behavior and should reduce automation confidence:",
  "",
  "- **Branch cleanup**: DeleteEvent for branches after PR merges is standard developer hygiene, NOT a bot signal. Do not penalize this.",
  "- **Commit message style**: AI-generated commit messages often follow a rigid pattern — overly formal, verbose, or formulaic (e.g. \"refactor: update component to improve performance and maintainability\"). Human commits tend to be terse, inconsistent in style, and context-specific. Look for unnatural uniformity in tone or structure across commits.",
  "- **Maintainer-scale activity**: Established accounts (1+ years) with many personal repos who are active across related repos (e.g. within an org or ecosystem) are likely maintainers. High volume is expected, not suspicious.",
  "- **Org-aligned activity**: If the user belongs to organizations, activity across repos within those orgs is expected maintainer behavior — not \"external repo spread.\" Only flag repo spread for repos outside the user's orgs.",
  "- **Mixed event types including human interactions**: A profile combining pushes, reviews, issue comments, and PR activity reflects natural maintainer workflow.",
  "",
  "CRITICAL: Volume alone is never sufficient evidence for automation. A prolific open-source maintainer can easily generate 200+ events in a few days through normal work. Always look at the *nature* of the activity, not just the *amount*.",
  "",
  "### Important Considerations",
  "- Timezone: Activity timestamps are UTC. What appears as odd hours may be normal in the user's timezone. Do not flag timing alone without corroborating patterns.",
  "- Sparse data: With fewer than 15 events, avoid high-confidence classifications in either direction. State that data is limited.",
  "- Single patterns are weak signals. Look for convergence of multiple independent patterns before classifying as automation.",
  "- Do not anchor on any provided heuristic score. Evaluate the raw event data independently and use heuristic flags only as supplementary context.",
  "",
  "## Confidence Score",
  "The confidence field (0-100) represents how confident you are in your chosen classification:",
  "- 90-100: Very strong evidence supporting your classification",
  "- 70-89: Clear evidence with minor ambiguities",
  "- 50-69: Moderate evidence, some conflicting signals",
  "- 30-49: Weak evidence, classification is a best guess",
  "- 0-29: Very limited data or highly ambiguous signals",
  "",
  "## Time Analysis Rules",
  "- Use 24-hour rolling windows for clustering analysis",
  "- Evaluate each calendar day independently",
  "- All timestamps are UTC",
  "",
  "## Output",
  "Return ONLY valid JSON with no markdown, code fences, or extra text:",
  "",
  '{',
  '  "classification": "organic",',
  '  "confidence": 85,',
  '  "reasoning": "2-3 sentences citing specific evidence (counts, timeframes, observed behaviors)."',
  '}',
  "",
  "The classification field must be one of: \"organic\", \"mixed\", or \"automation\".",
  "The reasoning must reference concrete data points, not generic descriptions.",
].join("\n");


export function buildUserPrompt(input: AIAnalysisInput): string {

  const events = slimEvents(input.events);
  const eventDates = input.events
    .map(e => e.created_at)
    .filter(Boolean)
    .sort();
  const uniqueRepos = new Set(input.events.map(e => e.repo?.name).filter(Boolean));
  const typeCounts: Record<string, number> = {};
  for (const e of input.events) {
    if (e.type) typeCounts[e.type] = (typeCounts[e.type] || 0) + 1;
  }

  const compactedData = compactor(
    JSON.stringify({
      events,
    }),
  );
  const userPrompt = [
    'User information:',
    `- Username: ${input.username}`,
    `- Account Created At: ${input.accountCreatedAt}`,
    `- Public Repos: ${input.publicRepos}`,
    `- Analysis Date: ${new Date().toISOString().split('T')[0]}`,
    `- Organizations: ${input.orgs?.length ? input.orgs.join(', ') : 'None / not provided'}`,
    '',
    'Event summary (based on the sampled events below, NOT complete account history):',
    `- Sampled events: ${input.events.length}`,
    `- Date range: ${eventDates[0] || 'N/A'} to ${eventDates[eventDates.length - 1] || 'N/A'}`,
    `- Unique repos: ${uniqueRepos.size}`,
    `- Event types: ${Object.entries(typeCounts).map(([k, v]) => `${k}(${v})`).join(', ')}`,
  ] 

  if(input.analysis) {
    const flagsSummary = input.analysis.flags.length
      ? input.analysis.flags.map(f => `${f.label} (${f.points} pts): ${f.detail}`).join("; ")
      : "None";
    userPrompt.push(
      "",
      "Heuristic analysis (supplementary context only — form your own assessment from the raw data):",
      `- Score: ${input.analysis.score}, Classification: ${input.analysis.classification}`,
      `- Flags: ${flagsSummary}`,
    )
  }

  userPrompt.push(
    "",
    'Events:',
    compactedData,
  )
  
  return userPrompt.join("\n")
}


function slimEvents(events: GitHubEvent[]) {
  return events.map((e) => {
    const payload = (e.payload ?? {});
    const slim: Record<string, unknown> = {
      type: e.type,
      created_at: e.created_at,
      repo: e.repo?.name,
      action: payload.action,
      ref: payload.ref,
      ref_type: payload.ref_type,
      size: payload.size,
    };

    if (Array.isArray(payload.commits)) {
      slim.commits = payload.commits.length;
      slim.commit_msgs = (payload.commits as { message?: string }[])
        .map(c => c.message?.split('\n')[0]?.slice(0, 80))
        .filter(Boolean);
    }

    const pr = payload.pull_request as { title?: string } | undefined;
    if (pr?.title) slim.pr_title = pr.title.slice(0, 120);

    const comment = payload.comment as { body?: string } | undefined;
    if (comment?.body) slim.comment_len = comment.body.length;

    return slim;
  });
}
