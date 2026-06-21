#!/usr/bin/env tsx

import {
	existsSync,
	readdirSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { IdentityClassification } from "../src/types";
import {
	getExpected,
	REGRESSION_FIXTURES,
} from "../test/regression-config";
import { obfuscateFixture } from "./utils/obfuscate";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, "../test/fixtures");
const REGRESSION_CONFIG_PATH = resolve(
	__dirname,
	"../test/regression-config.ts",
);
const REPORTS_DIR = resolve(__dirname, "../benchmark/reports");

const [, , inputPath] = process.argv;

if (!inputPath) {
	console.error("Usage: tsx scripts/obfuscate-fixture.ts <input.json>");
	process.exit(1);
}

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

const entry =
	REGRESSION_FIXTURES[fixtureName as keyof typeof REGRESSION_FIXTURES];

if (!entry) {
	console.error(
		`"${fixtureName}" is not listed in regression-config.ts — add it first.`,
	);
	process.exit(1);
}

const classification: IdentityClassification = getExpected(entry);

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

function updateRegressionConfig(oldName: string, newN: string): void {
	let src = readFileSync(REGRESSION_CONFIG_PATH, "utf-8");
	const pattern = new RegExp(
		`(["']?)${oldName.replace(/[-]/g, "\\$&")}\\1(\\s*:)`,
	);
	src = src.replace(pattern, `"${newN}"$2`);
	writeFileSync(REGRESSION_CONFIG_PATH, src, "utf-8");
}

function updateBenchmarkReports(oldName: string, newN: string): number {
	if (!existsSync(REPORTS_DIR)) return 0;
	const files = readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".json"));
	let updated = 0;
	for (const file of files) {
		const p = resolve(REPORTS_DIR, file);
		const content = readFileSync(p, "utf-8");
		const next = content.replaceAll(
			`"fixture": "${oldName}"`,
			`"fixture": "${newN}"`,
		);
		if (next !== content) {
			writeFileSync(p, next, "utf-8");
			updated++;
		}
	}
	return updated;
}

type JsonObject = { [key: string]: unknown };

const raw: JsonObject = JSON.parse(readFileSync(absInput, "utf-8"));
const { data, stats } = obfuscateFixture(
	raw as Parameters<typeof obfuscateFixture>[0],
);

writeFileSync(absOutput, JSON.stringify(data, null, "\t"), "utf-8");
unlinkSync(absInput);

updateRegressionConfig(fixtureName, newName);
const reportsUpdated = updateBenchmarkReports(fixtureName, newName);

console.log(`${fixtureName} (${classification}) → ${newName}`);
console.log(`  ${stats.logins} login(s), ${stats.repos} repo(s) obfuscated`);
console.log(`  regression-config.ts updated`);
if (reportsUpdated > 0) {
	console.log(`  ${reportsUpdated} benchmark report(s) updated`);
}
