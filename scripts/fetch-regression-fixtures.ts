#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { GitHubEvent } from "../src";
import { REGRESSION_FIXTURES } from "../test/regression-config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = path.join(__dirname, "../test/fixtures");

let GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Load from .env file if not in environment
if (!GITHUB_TOKEN) {
	const envPath = path.join(__dirname, "../.env");
	if (fs.existsSync(envPath)) {
		const envContent = fs.readFileSync(envPath, "utf-8");
		const match = envContent.match(/GITHUB_TOKEN\s*=\s*"?([^"\n%]+)"?/);
		if (match) {
			GITHUB_TOKEN = match[1].trim();
		}
	}
}

const headers: Record<string, string> = GITHUB_TOKEN
	? { Authorization: `token ${GITHUB_TOKEN}` }
	: {};

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

interface GitHubUser {
	login: string;
	created_at: string;
	public_repos: number;
}

async function fetchUserData(username: string): Promise<GitHubUser> {
	const response = await fetch(`https://api.github.com/users/${username}`, {
		headers,
	});

	if (!response.ok) {
		throw new Error(
			`Failed to fetch user ${username}: ${response.status} ${response.statusText}`,
		);
	}

	const data = (await response.json()) as GitHubUser;

	return {
		login: data.login,
		created_at: data.created_at,
		public_repos: data.public_repos,
	};
}

async function fetchUserEvents(username: string): Promise<GitHubEvent[]> {
	const events = [];
	const MAX_PAGES = 2;

	for (let page = 1; page <= MAX_PAGES; page++) {
		const response = await fetch(
			`https://api.github.com/users/${username}/events?per_page=100&page=${page}`,
			{ headers },
		);

		if (!response.ok) {
			throw new Error(
				`Failed to fetch events for ${username}: ${response.status} ${response.statusText}`,
			);
		}

		const pageEvents = (await response.json()) as GitHubEvent[];

		if (pageEvents.length === 0) break;
		events.push(...pageEvents);
	}

	return events;
}

async function fetchFixture(username: string): Promise<void> {
	try {
		console.log(`Fetching ${username}...`);
		const user = await fetchUserData(username);
		await delay(1000);
		const events = await fetchUserEvents(username);

		const outputPath = path.join(FIXTURES_DIR, `${username}.json`);
		const data = { user, events };

		fs.mkdirSync(FIXTURES_DIR, { recursive: true });
		fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));

		console.log(
			`✅ ${username}: ${events.length} events, ${user.public_repos} repos`,
		);
	} catch (error) {
		console.error(
			`❌ ${username}: ${error instanceof Error ? error.message : String(error)}`,
		);
		throw error;
	}
}

async function main(): Promise<void> {
	console.log("\nFetching regression test fixtures from GitHub");
	console.log("═".repeat(60));
	if (!GITHUB_TOKEN) {
		console.log(
			"⚠️  No GITHUB_TOKEN set - using unauthenticated API (60 req/hr limit)",
		);
		console.log("    Set GITHUB_TOKEN env var for 5000 req/hr\n");
	} else {
		console.log("✅ Using GitHub token (5000 req/hr limit)\n");
	}

	const usernames = Object.keys(REGRESSION_FIXTURES);
	const total = usernames.length;
	let completed = 0;
	let failed = 0;

	for (const username of usernames) {
		try {
			await fetchFixture(username);
			completed++;
			if (completed < total) {
				await delay(2000);
			}
		} catch {
			failed++;
		}
	}

	console.log(`\n ${"═".repeat(60)}`);
	console.log(`Results: ${completed}/${total} successful`);
	if (failed > 0) {
		console.log(`⚠️  ${failed} failed`);
		if (!GITHUB_TOKEN) {
			console.log("\n💡 Tip: Set GITHUB_TOKEN to retry failed accounts:");
			console.log("   export GITHUB_TOKEN=your_github_token");
			console.log("   npm run update-fixtures");
		}
		process.exit(1);
	} else {
		console.log("✅ All fixtures updated!");
	}
	console.log(`${"═".repeat(60)}\n`);
}

main();
