import { identify } from "../src/index";
import { getAIAnalysis } from "../src/ai/index";

const username = process.argv[2];
const model = process.argv[3] || "openai/gpt-4o-mini";
const token = process.env.GITHUB_TOKEN;

if (!username) {
    console.error("Usage: GITHUB_TOKEN=<token> npx jiti scripts/ai-analyser-user.ts <username> [model]");
    console.error("Example: npx jiti scripts/ai-analyser-user.ts octocat openai/gpt-4o");
    process.exit(1);
}

if (!token) {
    console.error("Error: GITHUB_TOKEN environment variable is required");
    process.exit(1);
}

async function run() {
    console.log(`Fetching data for: ${username}`);

    const userRes = await fetch(`https://api.github.com/users/${username}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) throw new Error(`GitHub API error: ${userRes.status} ${userRes.statusText}`);
    const user = await userRes.json();

    console.log(`Fetching orgs...`);
    const orgsRes = await fetch(`https://api.github.com/users/${username}/orgs`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const orgs = orgsRes.ok
        ? (await orgsRes.json()).map((o: { login: string }) => o.login)
        : []; 
    console.log(`Fetching events...`);
    const events = [];
    for (let page = 1; page <= 2; page++) {
        const res = await fetch(
            `https://api.github.com/users/${username}/events?per_page=300&page=${page}`,
            { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
        const page_events = await res.json();
        if (page_events.length === 0) break;
        events.push(...page_events);
    }

    console.log(`Running heuristic analysis...`);
    const analysis = identify({
        createdAt: user.created_at,
        reposCount: user.public_repos,
        accountName: user.login,
        events,
    });

    console.log("\n--- Heuristic Result ---");
    console.log(`Classification: ${analysis.classification}`);
    console.log(`Score: ${analysis.score}`);
    if (analysis.flags.length) {
        console.log("Flags:");
        for (const flag of analysis.flags) {
            console.log(`  - ${flag.label} (${flag.points} pts): ${flag.detail}`);
        }
    }

    console.log(`\nRunning AI analysis with model: ${model}...`);
    const aiResult = await getAIAnalysis({
        token: token!,
        model,
        username: user.login,
        // let's test without. Feels like this influence too much the LLM
        // analysis,
        accountCreatedAt: user.created_at,
        publicRepos: user.public_repos,
        events,
        orgs,
    });

    if (!aiResult) {
        console.error("AI analysis returned no result.");
        process.exit(1);
    }

    console.log("\n--- AI Result ---");
    console.log(`Classification: ${aiResult.classification}`);
    console.log(`Confidence: ${aiResult.confidence}`);
    console.log(`Reasoning: ${aiResult.reasoning}`);
}

run().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
});