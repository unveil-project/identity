#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GitHubEvent, IdentityClassification } from "../src";
import { obfuscateFixture } from "./utils/obfuscate";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "../test/fixtures");
const REGRESSION_CONFIG_PATH = path.join(
	__dirname,
	"../test/regression-config.ts",
);

const VALID_CLASSIFICATIONS: IdentityClassification[] = [
	"organic",
	"automation",
	"mixed",
];

const [, , username, classificationArg] = process.argv;

if (
	!username ||
	!classificationArg ||
	!VALID_CLASSIFICATIONS.includes(classificationArg as IdentityClassification)
) {
	console.error(
		"Usage: tsx scripts/add-fixture.ts <github-username> <organic|automation|mixed>",
	);
	process.exit(1);
}

const classification = classificationArg as IdentityClassification;

let GITHUB_TOKEN = process.env.GITHUB_TOKEN;
if (!GITHUB_TOKEN) {
	const envPath = path.join(__dirname, "../.env");
	if (fs.existsSync(envPath)) {
		const envContent = fs.readFileSync(envPath, "utf-8");
		const match = envContent.match(/GITHUB_TOKEN\s*=\s*"?([^"\n%]+)"?/);
		if (match) GITHUB_TOKEN = match[1].trim();
	}
}

const headers: Record<string, string> = GITHUB_TOKEN
	? { Authorization: `token ${GITHUB_TOKEN}` }
	: {};

async function fetchUser(
	login: string,
): Promise<{ login: string; created_at: string; public_repos: number }> {
	const res = await fetch(`https://api.github.com/users/${login}`, {
		headers,
	});
	if (!res.ok) {
		throw new Error(`Failed to fetch user: ${res.status} ${res.statusText}`);
	}
	const data = (await res.json()) as {
		login: string;
		created_at: string;
		public_repos: number;
	};
	return {
		login: data.login,
		created_at: data.created_at,
		public_repos: data.public_repos,
	};
}

async function fetchEvents(login: string): Promise<GitHubEvent[]> {
	const events: GitHubEvent[] = [];
	for (let page = 1; page <= 2; page++) {
		const res = await fetch(
			`https://api.github.com/users/${login}/events?per_page=100&page=${page}`,
			{ headers },
		);
		if (!res.ok) {
			throw new Error(
				`Failed to fetch events: ${res.status} ${res.statusText}`,
			);
		}
		const pageEvents = (await res.json()) as GitHubEvent[];
		if (pageEvents.length === 0) break;
		events.push(...pageEvents);
	}
	return events;
}

function nextFixtureName(kind: IdentityClassification): string {
	const existing = fs
		.readdirSync(FIXTURES_DIR)
		.map((f) => path.basename(f, ".json"))
		.filter((n) => n.startsWith(`${kind}_`))
		.map((n) => Number(n.slice(kind.length + 1)))
		.filter((n) => !Number.isNaN(n));
	const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
	return `${kind}_${next}`;
}

function addToRegressionConfig(
	name: string,
	kind: IdentityClassification,
): void {
	let src = fs.readFileSync(REGRESSION_CONFIG_PATH, "utf-8");
	src = src.replace(/(\n\} satisfies)/, `\n\t"${name}": "${kind}",$1`);
	fs.writeFileSync(REGRESSION_CONFIG_PATH, src, "utf-8");
}

async function main(): Promise<void> {
	if (!GITHUB_TOKEN) {
		console.warn(
			"⚠️  No GITHUB_TOKEN — using unauthenticated API (60 req/hr limit)",
		);
	}

	console.log(`Fetching ${username}...`);
	const user = await fetchUser(username);
	await new Promise((r) => setTimeout(r, 500));
	const events = await fetchEvents(username);

	// Round-trip through JSON to get a plain JsonObject for obfuscation
	const raw = JSON.parse(JSON.stringify({ user, events })) as {
		[key: string]: { [key: string]: unknown };
	};
	const { data, stats } = obfuscateFixture(
		raw as Parameters<typeof obfuscateFixture>[0],
	);

	const fixtureName = nextFixtureName(classification);
	const outputPath = path.join(FIXTURES_DIR, `${fixtureName}.json`);

	fs.mkdirSync(FIXTURES_DIR, { recursive: true });
	fs.writeFileSync(outputPath, JSON.stringify(data, null, "\t"));

	addToRegressionConfig(fixtureName, classification);

	console.log(`✅ ${username} → ${fixtureName} (${classification})`);
	console.log(
		`   ${events.length} events, ${stats.logins} login(s), ${stats.repos} repo(s) obfuscated`,
	);
	console.log("   regression-config.ts updated");
}

main().catch((err) => {
	console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
});
