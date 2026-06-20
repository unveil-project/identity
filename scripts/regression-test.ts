#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { identify } from "../src/identify";
import type { IdentityClassification } from "../src/types";
import { REGRESSION_FIXTURES } from "../test/regression-config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RegressionResult {
	fixture: string;
	expected: IdentityClassification;
	actual: IdentityClassification;
	score: number;
	passed: boolean;
}

function loadFixture(fixtureName: string) {
	const fixturePath = path.join(
		__dirname,
		`../test/fixtures/${fixtureName}.json`,
	);
	return JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
}

function runRegressionTests(): RegressionResult[] {
	return Object.entries(REGRESSION_FIXTURES).map(([fixtureName, expected]) => {
		const fixture = loadFixture(fixtureName);
		const { user, events } = fixture;

		const result = identify({
			createdAt: user.created_at,
			reposCount: user.public_repos,
			accountName: user.login,
			events: events || [],
		});

		return {
			fixture: fixtureName,
			expected,
			actual: result.classification,
			score: result.score,
			passed: result.classification === expected,
		};
	});
}

function printResults(results: RegressionResult[]): void {
	const passed = results.filter((r) => r.passed).length;
	const failed = results.filter((r) => !r.passed).length;

	console.log("\n Regression Test Results");
	console.log("═".repeat(60));

	for (const result of results) {
		const icon = result.passed ? "✅" : "⚠️";
		const status = result.passed ? "PASS" : "FAIL";
		console.log(
			`${icon} ${result.fixture}: ${status} (expected: ${result.expected}, actual: ${result.actual}, score: ${result.score})`,
		);
	}

	console.log("\n Summary:");
	console.log(`Total: ${results.length}`);
	console.log(`Passed: ${passed}`);
	console.log(`Failed: ${failed}`);
	console.log(`\n ${"═".repeat(60)}`);

	if (failed === 0) {
		console.log("✅ All tests passed!");
	} else {
		console.log("⚠️  Some fixtures did not match expected classifications.");
	}

	console.log(`${"═".repeat(60)}\n`);
}

try {
	const results = runRegressionTests();
	printResults(results);

	if (results.some((r) => !r.passed)) {
		process.exit(1);
	}
} catch (error) {
	console.error("Error running regression tests:", error);
	process.exit(1);
}
