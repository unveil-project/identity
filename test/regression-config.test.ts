import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { IdentityClassification } from "../src";
import {
	getExpected,
	getKnownAs,
	REGRESSION_FIXTURES,
} from "./regression-config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CLASSIFICATIONS: IdentityClassification[] = [
	"organic",
	"mixed",
	"automation",
	"insufficient-data",
];

describe("regression config", () => {
	it("parses and lists fixtures", () => {
		expect(Object.keys(REGRESSION_FIXTURES).length).toBeGreaterThan(0);
	});

	it("only expects classifications identify() can return", () => {
		for (const [name, entry] of Object.entries(REGRESSION_FIXTURES)) {
			expect(CLASSIFICATIONS, `${name} expected`).toContain(
				getExpected(entry),
			);

			const knownAs = getKnownAs(entry);
			if (knownAs !== undefined) {
				expect(CLASSIFICATIONS, `${name} knownAs`).toContain(knownAs);
			}
		}
	});

	it("names a fixture file that exists", () => {
		for (const name of Object.keys(REGRESSION_FIXTURES)) {
			const fixturePath = path.join(__dirname, `fixtures/${name}.json`);
			expect(fs.existsSync(fixturePath), `missing ${name}.json`).toBe(true);
		}
	});

	// Without a capture date the fixture is replayed against today's clock, so
	// its account keeps ageing and the expected classification drifts on its own.
	it("stamps every fixture with the date it was captured", () => {
		for (const name of Object.keys(REGRESSION_FIXTURES)) {
			const fixturePath = path.join(__dirname, `fixtures/${name}.json`);
			const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf-8"));

			expect(typeof fixture.capturedAt, `${name} capturedAt`).toBe("string");
			expect(
				Number.isNaN(new Date(fixture.capturedAt).getTime()),
				`${name} capturedAt is not a valid date`,
			).toBe(false);

			const events: Array<{ created_at: string }> = fixture.events ?? [];
			const newestEvent = events
				.map((e) => e.created_at)
				.sort()
				.pop();

			if (newestEvent) {
				expect(
					new Date(fixture.capturedAt).getTime(),
					`${name} was captured before its newest event`,
				).toBeGreaterThanOrEqual(new Date(newestEvent).getTime());
			}
		}
	});
});
