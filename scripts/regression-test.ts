#!/usr/bin/env tsx

/**
 * Regression Test Runner
 *
 * Usage:
 *   tsx scripts/regression-test.ts           # Run and save report
 *   tsx scripts/regression-test.ts --dry-run # Run without saving report
 *
 * Via npm:
 *   npm run regression-test                  # Run and save
 *   npm run regression-test:dry              # Dry run (no report)
 */

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
	regression: boolean;
}

interface RegressionReport {
	timestamp: string;
	version: string;
	results: RegressionResult[];
	summary: {
		total: number;
		passed: number;
		failed: number;
		regressions: number;
	};
	status: "success" | "failure" | "regression";
}

async function getPackageVersion(): Promise<string> {
	const packagePath = path.join(__dirname, "../package.json");
	const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf-8"));
	return packageJson.version;
}

function loadFixture(fixtureName: string) {
	const fixturePath = path.join(
		__dirname,
		`../test/fixtures/${fixtureName}.json`,
	);
	return JSON.parse(fs.readFileSync(fixturePath, "utf-8"));
}

function getPreviousReports(): RegressionReport[] {
	const reportsDir = path.join(__dirname, "../benchmark/reports");
	if (!fs.existsSync(reportsDir)) {
		fs.mkdirSync(reportsDir, { recursive: true });
		return [];
	}

	const files = fs.readdirSync(reportsDir).filter((f) => f.endsWith(".json"));
	return files
		.sort()
		.map((f) => JSON.parse(fs.readFileSync(path.join(reportsDir, f), "utf-8")));
}

function getLastPassingClassification(
	fixtureName: string,
	reports: RegressionReport[],
): IdentityClassification | null {
	for (let i = reports.length - 1; i >= 0; i--) {
		const result = reports[i].results.find((r) => r.fixture === fixtureName);
		if (result?.passed) {
			return result.actual;
		}
	}
	return null;
}

async function runRegressionTests(): Promise<RegressionReport> {
	const previousReports = getPreviousReports();
	const results: RegressionResult[] = [];
	let regressions = 0;

	for (const [fixtureName, expected] of Object.entries(REGRESSION_FIXTURES)) {
		const fixture = loadFixture(fixtureName);
		const { user, events } = fixture;

		const result = identify({
			createdAt: user.created_at,
			reposCount: user.public_repos,
			accountName: user.login,
			events: events || [],
		});

		const passed = result.classification === expected;
		const lastPassing = getLastPassingClassification(
			fixtureName,
			previousReports,
		);

		const regression = !passed && lastPassing !== null;

		if (regression) {
			regressions++;
		}

		results.push({
			fixture: fixtureName,
			expected,
			actual: result.classification,
			score: result.score,
			passed,
			regression,
		});
	}

	const passed = results.filter((r) => r.passed).length;
	const failed = results.filter((r) => !r.passed).length;
	let status: "success" | "failure" | "regression" = "success";
	if (regressions > 0) {
		status = "regression";
	} else if (failed > 0) {
		status = "failure";
	}

	const version = await getPackageVersion();

	const report: RegressionReport = {
		timestamp: new Date().toISOString(),
		version,
		results,
		summary: {
			total: results.length,
			passed,
			failed,
			regressions,
		},
		status,
	};

	return report;
}

function saveReport(report: RegressionReport): string {
	const reportsDir = path.join(__dirname, "../benchmark/reports");
	fs.mkdirSync(reportsDir, { recursive: true });

	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const filename = `regression-report-v${report.version}-${timestamp}.json`;
	const filepath = path.join(reportsDir, filename);

	fs.writeFileSync(filepath, JSON.stringify(report, null, 2));
	return filepath;
}

function printReport(report: RegressionReport): void {
	console.log("\n Regression Test Report");
	console.log("═".repeat(60));
	console.log(`Version: ${report.version}`);
	console.log(`Timestamp: ${report.timestamp}`);
	console.log("─".repeat(60));

	console.log("\n Results:");
	for (const result of report.results) {
		const icon = result.passed ? "✅" : result.regression ? "🚨" : "⚠️";
		const status = result.regression
			? "REGRESSION"
			: result.passed
				? "PASS"
				: "FAIL";
		console.log(
			`${icon} ${result.fixture}: ${status} (expected: ${result.expected}, actual: ${result.actual})`,
		);
	}

	console.log("\n Summary:");
	console.log(`Total: ${report.summary.total}`);
	console.log(`Passed: ${report.summary.passed}`);
	console.log(`Failed: ${report.summary.failed}`);
	console.log(`Regressions: ${report.summary.regressions}`);

	console.log(`\n ${"═".repeat(60)}`);
	if (report.status === "success") {
		console.log("✅ All tests passed!");
	} else if (report.status === "regression") {
		console.log("🚨 REGRESSIONS DETECTED - Publishing blocked!");
	} else {
		console.log("⚠️  Tests failed - Publishing blocked!");
	}
	console.log(`${"═".repeat(60)}\n`);
}

async function main(): Promise<void> {
	try {
		const dryRun = process.argv.includes("--dry-run");
		const report = await runRegressionTests();

		if (dryRun) {
			printReport(report);
			console.log(`[DRY RUN] Report not saved\n`);
		} else {
			const reportPath = saveReport(report);
			printReport(report);
			console.log(`Report saved: ${reportPath}\n`);
		}

		if (report.status !== "success") {
			process.exit(1);
		}
	} catch (error) {
		console.error("Error running regression tests:", error);
		process.exit(1);
	}
}

main();
