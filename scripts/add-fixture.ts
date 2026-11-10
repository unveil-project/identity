#!/usr/bin/env tsx

import type { ClassificationLabel } from "../src";
import { classify } from "../src/classify";
import { fromGitHub, type GitHubInput } from "../src/providers/github";
import {
	FIXTURE_CATEGORIES,
	type FixtureCategory,
} from "../test/regression-config";
import { runAtCaptureTime } from "../test/utils/frozen-clock";
import {
	addToRegressionConfig,
	nextFixtureName,
	writeFixture,
} from "./utils/fixtures";
import { createGitHubClient, loadGitHubToken } from "./utils/github";
import { obfuscateFixture } from "./utils/obfuscate";

const [, , usernameArg, categoryArg] = process.argv;

if (
	!usernameArg ||
	!categoryArg ||
	!FIXTURE_CATEGORIES.includes(categoryArg as FixtureCategory)
) {
	console.error(
		`Usage: tsx scripts/add-fixture.ts <github-username> <${FIXTURE_CATEGORIES.join("|")}>`,
	);
	console.error(
		'  github-app: the account is a real GitHub App — GitHub reports type: "Bot"',
	);
	process.exit(1);
}

const username = usernameArg;
const category = categoryArg as FixtureCategory;

const GITHUB_TOKEN = loadGitHubToken();
const github = createGitHubClient(GITHUB_TOKEN);

async function main(): Promise<void> {
	if (!GITHUB_TOKEN) {
		console.warn(
			"⚠️  No GITHUB_TOKEN — using unauthenticated API (60 req/hr limit)",
		);
	}

	console.log(`Fetching ${username}...`);
	const capturedAt = new Date().toISOString();
	const user = await github.fetchUser(username);

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
	const events = await github.fetchEvents(username);

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
	// `isGitHubApp`, while the entry still pins whatever classify() scores the
	// app as, so a scoring change on apps shows up as a regression like any
	// other. Score the stored snapshot — that is what gets replayed.
	const expected: ClassificationLabel =
		category === "github-app"
			? runAtCaptureTime(
					capturedAt,
					() =>
						classify(fromGitHub(data as unknown as GitHubInput)).classification,
				)
			: category;

	const fixtureName = nextFixtureName(category);
	writeFixture(fixtureName, capturedAt, data);
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
