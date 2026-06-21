#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { identify } from "../src/identify";
import type { IdentityClassification } from "../src/types";
import {
	getExpected,
	getKnownAs,
	REGRESSION_FIXTURES,
} from "../test/regression-config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface RegressionResult {
	fixture: string;
	expected: IdentityClassification;
	knownAs: IdentityClassification | undefined;
	actual: IdentityClassification;
	score: number;
	passed: boolean;
	// true when passed but system output differs from known ground truth
	warned: boolean;
}

function loadFixture(fixtureName: string) {
	const fixturePath = path.join(
		__dirname,
		`../test/fixtures/${fixtureName}.json`,
	);
	return JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
}

function runRegressionTests(): RegressionResult[] {
	return Object.entries(REGRESSION_FIXTURES).map(([fixtureName, entry]) => {
		const fixture = loadFixture(fixtureName);
		const { user, events } = fixture;

		const result = identify({
			createdAt: user.created_at,
			reposCount: user.public_repos,
			accountName: user.login,
			events: events || [],
		});

		const expected = getExpected(entry);
		const knownAs = getKnownAs(entry);
		const passed = result.classification === expected;
		const warned = passed && knownAs !== undefined && knownAs !== expected;

		return {
			fixture: fixtureName,
			expected,
			knownAs,
			actual: result.classification,
			score: result.score,
			passed,
			warned,
		};
	});
}

function printResults(results: RegressionResult[]): void {
	const passed = results.filter((r) => r.passed).length;
	const failed = results.filter((r) => !r.passed).length;
	const warned = results.filter((r) => r.warned).length;

	console.log("\n Regression Test Results");
	console.log("═".repeat(60));

	for (const result of results) {
		if (!result.passed) {
			console.log(
				`❌ ${result.fixture}: FAIL (expected: ${result.expected}, actual: ${result.actual}, score: ${result.score})`,
			);
		} else if (result.warned) {
			console.log(
				`⚠️  ${result.fixture}: WARN — system says "${result.expected}" but known to be "${result.knownAs}" (score: ${result.score})`,
			);
		} else {
			console.log(
				`✅ ${result.fixture}: PASS (${result.actual}, score: ${result.score})`,
			);
		}
	}

	console.log("\n Summary:");
	console.log(`Total: ${results.length}`);
	console.log(`Passed: ${passed - warned}`);
	if (warned > 0) {
		console.log(
			`Warned: ${warned} (known misclassification — not a regression)`,
		);
	}
	if (failed > 0) {
		console.log(`Failed: ${failed}`);
	}
	console.log(`\n ${"═".repeat(60)}`);

	if (failed === 0 && warned === 0) {
		console.log("✅ All tests passed!");
	} else if (failed === 0) {
		console.log(
			`✅ All tests passed. ${warned} known misclassification(s) — update knownAs when the system improves.`,
		);
	} else {
		console.log("❌ Some fixtures did not match expected classifications.");
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
