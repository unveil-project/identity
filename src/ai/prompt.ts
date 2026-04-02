import { compactor } from "voight-kampff-compactor";
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
  const compactedData = compactor(
    JSON.stringify({
      events: slimEvents(input.events),
    }),
  );

  const userPrompt = [
    'User information:',
    `- Username: ${input.username}`,
    `- Account Created At: ${input.accountCreatedAt}`,
    `- Public Repos: ${input.publicRepos}`, 
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
    return {
      type: e.type,
      created_at: e.created_at,
      repo: e.repo?.name,
      action: payload.action,
      ref: payload.ref,
      ref_type: payload.ref_type,
      size: payload.size,
      commits: Array.isArray(payload.commits) ? payload.commits.length : undefined,
    };
  });
}
