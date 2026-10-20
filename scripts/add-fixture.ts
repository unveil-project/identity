#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GitHubEvent, IdentityClassification } from "../src/index.ts";
import { identify } from "../src/identify.ts";
import {
	FIXTURE_CATEGORIES,
	type FixtureCategory,
} from "../test/regression-config.ts";
import { runAtCaptureTime } from "../test/utils/frozen-clock.ts";
import { obfuscateFixture } from "./utils/obfuscate.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "../test/fixtures");
const REGRESSION_CONFIG_PATH = path.join(
	__dirname,
	"../test/regression-config.ts",
);

const [, , username, categoryArg] = process.argv;

if (
	!username ||
	!categoryArg ||
	!FIXTURE_CATEGORIES.includes(categoryArg as FixtureCategory)
) {
	console.error(
		`Usage: node scripts/add-fixture.ts <github-username> <${FIXTURE_CATEGORIES.join("|")}>`,
	);
	console.error(
		'  github-app: the account is a real GitHub App — GitHub reports type: "Bot"',
	);
	process.exit(1);
}

const category = categoryArg as FixtureCategory;

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

async function fetchUser(login: string): Promise<{
	login: string;
	created_at: string;
	public_repos: number;
	type: string;
}> {
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
		type: string;
	};
	return {
		login: data.login,
		created_at: data.created_at,
		public_repos: data.public_repos,
		// GitHub reports "Bot" for GitHub Apps. Keeping it is the whole point of
		// the github-app category: without it the snapshot loses what it is.
		type: data.type,
	};
}

async function fetchEvents(login: string): Promise<GitHubEvent[]> {
	const events: GitHubEvent[] = [];
	for (let page = 1; page <= 3; page++) {
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

function nextFixtureName(kind: FixtureCategory): string {
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
	const capturedAt = new Date().toISOString();
	const user = await fetchUser(username);

	// GitHub is the authority on what an account is, so a fixture can never be
	// filed under a category the API disagrees with.
	const isApp = user.type.toLowerCase() === "bot";
	if (isApp && category !== "github-app") {
		throw new Error(
			`${username} is a GitHub App (type: "${user.type}") — add it as "github-app", not "${category}".`,
		);
	}
	if (!isApp && category === "github-app") {
		throw new Error(
			`${username} is not a GitHub App (type: "${user.type}") — only apps are reported as "Bot".`,
		);
	}

	await new Promise((r) => setTimeout(r, 500));
	const events = await fetchEvents(username);

	// Round-trip through JSON to get a plain JsonObject for obfuscation
	const raw = JSON.parse(JSON.stringify({ user, events })) as {
		[key: string]: { [key: string]: unknown };
	};

	// A GitHub App is not a person, so there is no identity to hide: it is
	// stored as fetched, which also keeps the app recognisable in the fixture.
	const obfuscated =
		category === "github-app"
			? undefined
			: obfuscateFixture(raw as Parameters<typeof obfuscateFixture>[0]);
	const data = obfuscated?.data ?? raw;

	// Being an app is a fact, not a classification: the category pins
	// `isGitHubApp`, while the entry still pins whatever identify() scores the
	// app as, so a scoring change on apps shows up as a regression like any
	// other. Score the stored snapshot — that is what gets replayed.
	const expected: IdentityClassification =
		category === "github-app"
			? runAtCaptureTime(
					capturedAt,
					() =>
						identify(data as unknown as Parameters<typeof identify>[0])
							.classification,
				)
			: category;

	const fixtureName = nextFixtureName(category);
	const outputPath = path.join(FIXTURES_DIR, `${fixtureName}.json`);

	fs.mkdirSync(FIXTURES_DIR, { recursive: true });
	// capturedAt first: it pins the clock the fixture is replayed against.
	fs.writeFileSync(
		outputPath,
		JSON.stringify({ capturedAt, ...data }, null, "\t"),
	);

	addToRegressionConfig(fixtureName, expected);

	console.log(`✅ ${username} → ${fixtureName} (${category} → ${expected})`);
	console.log(
		obfuscated
			? `   ${events.length} events, ${obfuscated.stats.logins} login(s), ${obfuscated.stats.repos} repo(s) obfuscated`
			: `   ${events.length} events, stored as fetched (apps are not people)`,
	);
	console.log("   regression-config.ts updated");
}

main().catch((err) => {
	console.error(`❌ ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
});
