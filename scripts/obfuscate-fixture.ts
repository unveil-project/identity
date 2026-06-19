#!/usr/bin/env tsx
/**
 * Obfuscate personal data in GitHub event fixture files.
 *
 * Usage:
 *   tsx scripts/obfuscate-fixture.ts <input.json>
 *
 * The script:
 *   1. Looks up the fixture in regression-config.ts to get its classification
 *   2. Assigns the next available sequential name (e.g. organic_3, automation_2)
 *   3. Obfuscates all personal data in the fixture
 *   4. Writes the result under the new name, deletes the original
 *   5. Updates regression-config.ts and all benchmark reports to use the new name
 *
 * What gets obfuscated (deterministically via SHA-256):
 *   - login / display_login fields
 *   - all numeric id / *_id fields
 *   - node_id fields
 *   - repo names ("owner/repo" and short names in repo-like objects)
 *   - all GitHub URLs (api.github.com, github.com, avatars.githubusercontent.com)
 *
 * What is preserved:
 *   - event types, actions, timestamps, labels, issue/PR titles, body text,
 *     ref names, SHA hashes, counts — anything with semantic meaning that
 *     doesn't directly identify a person.
 */

import { createHash } from "node:crypto";
import {
	existsSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { GitHubEvent, GitHubUser, IdentityClassification } from "../src/types";
import { REGRESSION_FIXTURES } from "../test/regression-config";

interface FixtureFile {
	user: Pick<GitHubUser, "login" | "created_at" | "public_repos">;
	events: GitHubEvent[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, "../test/fixtures");
const REGRESSION_CONFIG_PATH = resolve(__dirname, "../test/regression-config.ts");
const REPORTS_DIR = resolve(__dirname, "../benchmark/reports");

const [, , inputPath] = process.argv;

if (!inputPath) {
	console.error("Usage: tsx scripts/obfuscate-fixture.ts <input.json>");
	process.exit(1);
}

// Resolve input: try as-is first, then look in test/fixtures/
function resolveInput(raw: string): string {
	const direct = resolve(raw);
	if (existsSync(direct)) return direct;
	const name = raw.endsWith(".json") ? raw : `${raw}.json`;
	const inFixtures = resolve(FIXTURES_DIR, basename(name));
	if (existsSync(inFixtures)) return inFixtures;
	console.error(`File not found: ${raw}`);
	process.exit(1);
}

const absInput = resolveInput(inputPath);
const fixtureName = basename(absInput, ".json");

// --- Look up classification ------------------------------------------------

const classification = REGRESSION_FIXTURES[
	fixtureName as keyof typeof REGRESSION_FIXTURES
] as IdentityClassification | undefined;

if (!classification) {
	console.error(
		`"${fixtureName}" is not listed in regression-config.ts — add it first.`,
	);
	process.exit(1);
}

// --- Pick next sequential name ---------------------------------------------

function nextFixtureName(kind: IdentityClassification): string {
	const existing = readdirSync(FIXTURES_DIR)
		.map((f) => basename(f, ".json"))
		.filter((n) => n.startsWith(`${kind}_`))
		.map((n) => Number(n.slice(kind.length + 1)))
		.filter((n) => !Number.isNaN(n));
	const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;
	return `${kind}_${next}`;
}

const newName = nextFixtureName(classification);
const absOutput = resolve(FIXTURES_DIR, `${newName}.json`);

// --- Deterministic mappers -------------------------------------------------

function sha256(s: string | number): string {
	return createHash("sha256").update(String(s)).digest("hex");
}

const loginCache = new Map<string, string>();
function fakeLogin(real: string): string {
	if (!loginCache.has(real)) {
		loginCache.set(real, `user-${sha256(`login:${real}`).slice(0, 8)}`);
	}
	return loginCache.get(real)!;
}

const repoCache = new Map<string, string>();
function fakeRepo(fullName: string): string {
	// fullName must be "owner/repo"
	if (!repoCache.has(fullName)) {
		const slash = fullName.indexOf("/");
		const owner = fullName.slice(0, slash);
		const repo = fullName.slice(slash + 1);
		repoCache.set(
			fullName,
			`${fakeLogin(owner)}/repo-${sha256(`repo:${repo}`).slice(0, 8)}`,
		);
	}
	return repoCache.get(fullName)!;
}

const numericIdCache = new Map<number, number>();
function fakeNumericId(real: number): number {
	if (!numericIdCache.has(real)) {
		numericIdCache.set(real, parseInt(sha256(`numid:${real}`).slice(0, 8), 16));
	}
	return numericIdCache.get(real)!;
}

function fakeNodeId(real: string): string {
	return sha256(`nodeid:${real}`).slice(0, 24);
}

// --- URL obfuscation -------------------------------------------------------

function obfuscateUrl(url: string): string {
	let s = url;

	// avatars.githubusercontent.com/u/{numericId}[?...]
	s = s.replace(
		/(https:\/\/avatars\.githubusercontent\.com\/u\/)(\d+)(.*)/,
		(_, pre, id, suf) => `${pre}${fakeNumericId(Number(id))}${suf}`,
	);

	// api.github.com/repos/{owner}/{repo}[/...]
	s = s.replace(
		/(https:\/\/api\.github\.com\/repos\/)([^/]+)\/([^/?{]+)(.*)/,
		(_, pre, owner, repo, suf) => `${pre}${fakeRepo(`${owner}/${repo}`)}${suf}`,
	);

	// api.github.com/users/{login}[/...]
	s = s.replace(
		/(https:\/\/api\.github\.com\/users\/)([^/?{]+)(.*)/,
		(_, pre, login, suf) => `${pre}${fakeLogin(login)}${suf}`,
	);

	// api.github.com/orgs/{org}[/...]
	s = s.replace(
		/(https:\/\/api\.github\.com\/orgs\/)([^/?]+)(.*)/,
		(_, pre, org, suf) => `${pre}${fakeLogin(org)}${suf}`,
	);

	// github.com/{owner}/{repo}[/...] (must run before single-segment check)
	s = s.replace(
		/(https:\/\/github\.com\/)([^/]+)\/([^/?#\s]+)(.*)/,
		(_, pre, owner, repo, suf) => `${pre}${fakeRepo(`${owner}/${repo}`)}${suf}`,
	);

	// github.com/{login} — plain profile URL
	s = s.replace(
		/^(https:\/\/github\.com\/)([^/?#\s]+)$/,
		(_, pre, login) => `${pre}${fakeLogin(login)}`,
	);

	// git://github.com/{owner}/{repo}.git
	s = s.replace(
		/(git:\/\/github\.com\/)([^/]+)\/([^.]+)(\.git.*)/,
		(_, pre, owner, repo, suf) => `${pre}${fakeRepo(`${owner}/${repo}`)}${suf}`,
	);

	// git@github.com:{owner}/{repo}.git (SSH URL — colon separator)
	s = s.replace(
		/(git@github\.com:)([^/]+)\/([^.]+)(\.git.*)/,
		(_, pre, owner, repo, suf) => `${pre}${fakeRepo(`${owner}/${repo}`)}${suf}`,
	);

	return s;
}

// --- Deep transformer ------------------------------------------------------

type JsonValue =
	| string
	| number
	| boolean
	| null
	| JsonValue[]
	| { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

function transformObj(obj: JsonObject): JsonObject {
	const result: JsonObject = {};
	for (const [key, val] of Object.entries(obj)) {
		result[key] = transformValue(key, val, obj);
	}
	return result;
}

function repoFullNameFromUrl(url: unknown): string | null {
	if (!url || typeof url !== "string") return null;
	const m = url.match(/\/repos\/([^/]+)\/([^/?{]+)/);
	return m ? `${m[1]}/${m[2]}` : null;
}

function transformValue(
	key: string,
	val: JsonValue,
	parent: JsonObject,
): JsonValue {
	if (val === null || val === undefined) return val;

	if (Array.isArray(val)) {
		return val.map((item) =>
			typeof item === "object" && item !== null
				? transformObj(item as JsonObject)
				: item,
		);
	}

	if (typeof val === "object") return transformObj(val as JsonObject);

	if (typeof val === "string") {
		if (key === "login" || key === "display_login") return fakeLogin(val);

		if (key === "node_id") return fakeNodeId(val);

		// Full repo name ("owner/repo")
		if ((key === "name" || key === "full_name") && val.includes("/"))
			return fakeRepo(val);

		// Short repo name — resolve via parent's full_name or URL
		if (key === "name" && !val.includes("/")) {
			if (typeof parent.full_name === "string") {
				return fakeRepo(parent.full_name).split("/")[1]!;
			}
			const fullName = repoFullNameFromUrl(parent.url);
			if (fullName) return fakeRepo(fullName).split("/")[1]!;
		}

		if (
			key === "url" ||
			key === "html_url" ||
			key.endsWith("_url") ||
			val.startsWith("https://")
		) {
			return obfuscateUrl(val);
		}

		return val;
	}

	if (typeof val === "number") {
		if (key === "id" || key.endsWith("_id")) return fakeNumericId(val);

		return val;
	}

	return val;
}

// --- Update regression-config.ts -------------------------------------------

function updateRegressionConfig(oldName: string, newName: string): void {
	let src = readFileSync(REGRESSION_CONFIG_PATH, "utf-8");:
	const pattern = new RegExp(
		`(["']?)${oldName.replace(/[-]/g, "\\$&")}\\1(\\s*:)`,
	);
	src = src.replace(pattern, `"${newName}"$2`);
	writeFileSync(REGRESSION_CONFIG_PATH, src, "utf-8");
}

// --- Update benchmark reports ----------------------------------------------

function updateBenchmarkReports(oldName: string, newName: string): number {
	if (!existsSync(REPORTS_DIR)) return 0;
	const files = readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".json"));
	let updated = 0;
	for (const file of files) {
		const path = resolve(REPORTS_DIR, file);
		const content = readFileSync(path, "utf-8");
		const next = content.replaceAll(`"fixture": "${oldName}"`, `"fixture": "${newName}"`);
		if (next !== content) {
			writeFileSync(path, next, "utf-8");
			updated++;
		}
	}
	return updated;
}

// --- Run -------------------------------------------------------------------

const data: FixtureFile = JSON.parse(readFileSync(absInput, "utf-8"));
const obfuscated = transformObj(data as unknown as JsonObject);

writeFileSync(absOutput, JSON.stringify(obfuscated, null, "\t"), "utf-8");
unlinkSync(absInput);

updateRegressionConfig(fixtureName, newName);
const reportsUpdated = updateBenchmarkReports(fixtureName, newName);

console.log(`${fixtureName} (${classification}) → ${newName}`);
console.log(
	`  ${loginCache.size} login(s), ${repoCache.size} repo(s) obfuscated`,
);
console.log(`  regression-config.ts updated`);
if (reportsUpdated > 0) {
	console.log(`  ${reportsUpdated} benchmark report(s) updated`);
}
