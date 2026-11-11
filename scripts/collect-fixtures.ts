#!/usr/bin/env tsx

/**
 * Tops the regression suite up to a target number of fixtures per category,
 * using real accounts that opened PRs in the repos agentscan watches.
 *
 * Usage: tsx scripts/collect-fixtures.ts [--target=25] [--dry-run] [--logs=<file|url>]
 */

import fs from "node:fs";
import type { ClassificationLabel } from "../src";
import { classify } from "../src/classify";
import { CONFIG } from "../src/config";
import { fromGitHub, type GitHubInput } from "../src/providers/github";
import { runAtCaptureTime } from "../test/utils/frozen-clock";
import {
	addToRegressionConfig,
	countFixtures,
	listFixtureLogins,
	nextFixtureName,
	writeFixture,
} from "./utils/fixtures";
import {
	createGitHubClient,
	GitHubRequestError,
	loadGitHubToken,
} from "./utils/github";
import { obfuscatedLogin, obfuscateFixture } from "./utils/obfuscate";

const DEFAULT_LOGS_URL =
	"https://raw.githubusercontent.com/MatteoGabriele/agentscan-logs/main/data/hourly-window-scan-results.txt";
const DEFAULT_TARGET = 25;
const DELAY_BETWEEN_CANDIDATES_MS = 300;

// agentscan's sentinel for "not enough activity to score".
const INSUFFICIENT_DATA_SCORE = -1;

const CATEGORIES = ["organic", "mixed", "automation"] as const;
type Category = (typeof CATEGORIES)[number];

interface LoggedPr {
	repo: string;
	number: number;
	score: number;
}

interface CollectedFixture {
	fixtureName: string;
	category: Category;
	login: string;
	score: number;
	source: string;
}

type CandidateOutcome =
	| { kind: "accepted"; fixture: CollectedFixture }
	| { kind: "skipped"; reason: string };

interface Options {
	target: number;
	dryRun: boolean;
	logs: string;
}

function readFlag(args: string[], name: string): string | undefined {
	const prefix = `--${name}=`;
	const arg = args.find((a) => a.startsWith(prefix));

	return arg?.slice(prefix.length);
}

function parseOptions(args: string[]): Options {
	const targetFlag = readFlag(args, "target");
	const target = targetFlag ? Number(targetFlag) : DEFAULT_TARGET;

	if (!Number.isInteger(target) || target < 1) {
		console.error(`--target must be a positive integer, got "${targetFlag}"`);
		process.exit(1);
	}

	return {
		target,
		dryRun: args.includes("--dry-run"),
		logs: readFlag(args, "logs") ?? DEFAULT_LOGS_URL,
	};
}

async function loadLogs(source: string): Promise<string> {
	if (!source.startsWith("https://")) {
		return fs.readFileSync(source, "utf-8");
	}

	const response = await fetch(source);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch logs: ${response.status} ${response.statusText}`,
		);
	}

	return response.text();
}

/**
 * Reads agentscan's compact log: a `REPOS:` header, then one row per PR as
 * `<ts>,<score>,<pr>,<status>,<user_ts>,<repos>,<events>,<repo_idx>,...`.
 * A PR scanned more than once keeps its latest row.
 */
function parseLoggedPrs(content: string): LoggedPr[] {
	const [header = "", ...rows] = content.split("\n");

	if (!header.startsWith("REPOS:")) {
		throw new Error("Logs do not start with a REPOS: header");
	}

	const repos = header.slice("REPOS:".length).split(",");
	const prs = new Map<string, LoggedPr>();

	for (const row of rows) {
		const fields = row.split(",");
		const score = Number(fields[1]);
		const number = Number(fields[2]);
		const repo = repos[Number(fields[7])];

		const isUsable =
			repo !== undefined &&
			Number.isInteger(number) &&
			number > 0 &&
			Number.isFinite(score);

		if (isUsable) {
			prs.set(`${repo}#${number}`, { repo, number, score });
		}
	}

	return [...prs.values()];
}

function categoryForScore(score: number): Category | undefined {
	if (score === INSUFFICIENT_DATA_SCORE) {
		return undefined;
	}

	if (score >= CONFIG.THRESHOLD_HUMAN) {
		return "organic";
	}

	if (score >= CONFIG.THRESHOLD_SUSPICIOUS) {
		return "mixed";
	}

	return "automation";
}

function shuffle<T>(items: T[]): T[] {
	const shuffled = [...items];

	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j] as T, shuffled[i] as T];
	}

	return shuffled;
}

function groupByCategory(prs: LoggedPr[]): Map<Category, LoggedPr[]> {
	const pools = new Map<Category, LoggedPr[]>(
		CATEGORIES.map((category) => [category, []]),
	);

	for (const pr of prs) {
		const category = categoryForScore(pr.score);
		if (category) {
			pools.get(category)?.push(pr);
		}
	}

	return pools;
}

function isBot(type: string | undefined): boolean {
	return type?.toLowerCase() === "bot";
}

function pause(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The accounts each run creates are new to it, and the ones already in the
 * suite are only known by their obfuscated login — both are checked here.
 */
function createSeenAccounts() {
	const seen = listFixtureLogins();

	return {
		has: (login: string) => seen.has(obfuscatedLogin(login)),
		add: (login: string) => seen.add(obfuscatedLogin(login)),
	};
}

async function tryCandidate(
	pr: LoggedPr,
	category: Category,
	github: ReturnType<typeof createGitHubClient>,
	seen: ReturnType<typeof createSeenAccounts>,
	dryRun: boolean,
): Promise<CandidateOutcome> {
	const author = await github.fetchPullRequestAuthor(pr.repo, pr.number);

	if (!author) {
		return { kind: "skipped", reason: "author deleted" };
	}

	if (isBot(author.type)) {
		return { kind: "skipped", reason: "GitHub App" };
	}

	if (seen.has(author.login)) {
		return { kind: "skipped", reason: "already a fixture" };
	}

	// Seen from here on, whatever the outcome: an account that does not fit
	// this category now will not fit it on its next PR either.
	seen.add(author.login);

	const capturedAt = new Date().toISOString();
	const user = await github.fetchUser(author.login);
	const events = await github.fetchEvents(author.login);

	const { data } = obfuscateFixture(
		JSON.parse(JSON.stringify({ user, events })),
	);

	// Score the snapshot exactly as the regression test will replay it.
	const result = runAtCaptureTime(capturedAt, () =>
		classify(fromGitHub(data as unknown as GitHubInput)),
	);

	if (result.isGitHubApp) {
		return { kind: "skipped", reason: "GitHub App" };
	}

	const classification: ClassificationLabel = result.classification;
	if (classification !== category) {
		return { kind: "skipped", reason: `now scores ${classification}` };
	}

	const fixtureName = dryRun ? "(dry run)" : nextFixtureName(category);

	if (!dryRun) {
		writeFixture(fixtureName, capturedAt, data);
		addToRegressionConfig(fixtureName, category);
	}

	return {
		kind: "accepted",
		fixture: {
			fixtureName,
			category,
			login: author.login,
			score: result.score,
			source: `${pr.repo}#${pr.number}`,
		},
	};
}

function formatSkipReasons(reasons: Map<string, number>): string {
	return [...reasons.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([reason, count]) => `${count} ${reason}`)
		.join(", ");
}

async function collectCategory(
	category: Category,
	needed: number,
	pool: LoggedPr[],
	github: ReturnType<typeof createGitHubClient>,
	seen: ReturnType<typeof createSeenAccounts>,
	options: Options,
	collected: CollectedFixture[],
): Promise<void> {
	const skipReasons = new Map<string, number>();
	let accepted = 0;

	for (const pr of shuffle(pool)) {
		if (accepted >= needed) {
			break;
		}

		let outcome: CandidateOutcome;
		try {
			outcome = await tryCandidate(pr, category, github, seen, options.dryRun);
		} catch (error) {
			// Running out of quota ends the run; anything else (a deleted PR, a
			// suspended account) only costs this candidate.
			if (error instanceof GitHubRequestError && error.rateLimited) {
				throw error;
			}

			const reason =
				error instanceof GitHubRequestError ? `HTTP ${error.status}` : "error";
			outcome = { kind: "skipped", reason };
		}

		if (outcome.kind === "accepted") {
			accepted++;
			collected.push(outcome.fixture);
			console.log(
				`  ✅ ${accepted}/${needed} ${outcome.fixture.fixtureName} ← ${outcome.fixture.login} (score ${outcome.fixture.score})`,
			);
		} else {
			skipReasons.set(
				outcome.reason,
				(skipReasons.get(outcome.reason) ?? 0) + 1,
			);
		}

		await pause(DELAY_BETWEEN_CANDIDATES_MS);
	}

	if (skipReasons.size > 0) {
		console.log(`  skipped: ${formatSkipReasons(skipReasons)}`);
	}

	if (accepted < needed) {
		console.log(
			`  ⚠️  only ${accepted}/${needed} — the logs ran out of ${category} candidates`,
		);
	}
}

function printReview(collected: CollectedFixture[], dryRun: boolean): void {
	if (collected.length === 0) {
		return;
	}

	console.log(`\n${"═".repeat(60)}`);
	console.log(
		dryRun
			? "Would add (nothing written):"
			: "Added — review these before committing, the category is the classifier's call:",
	);

	for (const fixture of collected) {
		console.log(
			`  ${fixture.fixtureName.padEnd(16)} ${fixture.category.padEnd(10)} score ${String(fixture.score).padStart(3)}  https://github.com/${fixture.login}  (via ${fixture.source})`,
		);
	}
}

async function main(): Promise<void> {
	const options = parseOptions(process.argv.slice(2));
	const token = loadGitHubToken();

	// Each candidate costs ~5 requests and many are skipped, which burns
	// through the 60/hr unauthenticated limit before the first category fills.
	if (!token) {
		console.error("GITHUB_TOKEN is required (env var or .env)");
		process.exit(1);
	}

	const github = createGitHubClient(token);

	console.log(`Reading agentscan logs from ${options.logs}`);
	const pools = groupByCategory(parseLoggedPrs(await loadLogs(options.logs)));
	const seen = createSeenAccounts();
	const collected: CollectedFixture[] = [];

	try {
		for (const category of CATEGORIES) {
			const existing = countFixtures(category);
			const needed = options.target - existing;
			const pool = pools.get(category) ?? [];

			console.log(
				`\n${category}: ${existing}/${options.target} — ${pool.length} logged PRs to draw from`,
			);

			if (needed <= 0) {
				continue;
			}

			await collectCategory(
				category,
				needed,
				pool,
				github,
				seen,
				options,
				collected,
			);
		}
	} finally {
		printReview(collected, options.dryRun);
	}
}

main().catch((error) => {
	console.error(
		`\n❌ ${error instanceof Error ? error.message : String(error)}`,
	);
	process.exit(1);
});
