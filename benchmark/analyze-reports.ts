#!/usr/bin/env tsx

/**
 * Quick Guide to Reviewing Regression Test Reports
 *
 * Usage:
 *   tsx benchmark/analyze-reports.ts        # Show summary of all reports
 *   tsx benchmark/analyze-reports.ts --full  # Show detailed breakdown
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reportsDir = path.join(__dirname, "reports");
const showFull = process.argv.includes("--full");

interface RegressionReport {
  timestamp: string;
  version: string;
  status: "success" | "failure" | "regression";
  results: Array<{ fixture: string; expected: string; actual: string; score: number; passed: boolean }>;
  summary: {
    total: number;
    passed: number;
    failed: number;
    regressions: number;
  };
}

function loadReports(): RegressionReport[] {
  if (!fs.existsSync(reportsDir)) {
    console.log("No reports found in benchmark/reports/");
    return [];
  }

  const files = fs
    .readdirSync(reportsDir)
    .filter((f) => f.endsWith(".json"))
    .sort();

  return files.map((f) =>
    JSON.parse(fs.readFileSync(path.join(reportsDir, f), "utf-8"))
  );
}

function analyzeReports(reports: RegressionReport[]): void {
  if (reports.length === 0) {
    console.log(
      "\n📊 No regression test reports yet. Run 'npm run regression-test' to generate one.\n"
    );
    return;
  }

  console.log("\n📊 Regression Test Report Analysis");
  console.log("═".repeat(70));

  const latest = reports[reports.length - 1];

  console.log("\n📌 Latest Report:");
  console.log(`   Version: ${latest.version}`);
  console.log(
    `   Time: ${new Date(latest.timestamp).toLocaleString()}`
  );
  console.log(
    `   Status: ${latest.status === "success" ? "✅ Success" : "⚠️  " + latest.status.toUpperCase()}`
  );

  // Show trend
  if (reports.length > 1) {
    console.log("\n📈 Trend (last 5 runs):");
    const recentReports = reports.slice(-5);
    recentReports.forEach((report) => {
      const passed = report.summary.passed;
      const total = report.summary.total;
      const regressions = report.summary.regressions;
      const icon = report.status === "success" ? "✅" : "⚠️";
      console.log(
        `   ${icon} v${report.version}: ${passed}/${total} passed, ${regressions} regression${regressions !== 1 ? "s" : ""}`
      );
    });
  }

  // Show failing fixtures
  const failing = latest.results.filter((r) => !r.passed);
  if (failing.length > 0) {
    console.log(`\n❌ Failing Fixtures (${failing.length}):`);
    failing.forEach((result) => {
      console.log(
        `   • ${result.fixture}: expected ${result.expected}, got ${result.actual} (score: ${result.score})`
      );
    });
  }

  if (showFull) {
    console.log("\n📋 All Results:");
    latest.results.forEach((result) => {
      const icon = result.passed ? "✅" : "⚠️";
      console.log(
        `   ${icon} ${result.fixture}: ${result.actual} (score: ${result.score})`
      );
    });
  }

  console.log("\n" + "═".repeat(70) + "\n");

  if (failing.length === 0) {
    console.log("💡 Tip: Compare fixture score with thresholds:");
    console.log("   • Score >= 70: organic");
    console.log("   • Score 50-69: mixed");
    console.log("   • Score < 50: automation\n");
  }
}

const reports = loadReports();
analyzeReports(reports);
