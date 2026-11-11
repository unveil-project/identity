import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ClassificationLabel } from "../../src";
import type { FixtureCategory } from "../../test/regression-config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURES_DIR = path.join(__dirname, "../../test/fixtures");
const REGRESSION_CONFIG_PATH = path.join(
	__dirname,
	"../../test/regression-config.ts",
);

function listFixtureNames(): string[] {
	return fs
		.readdirSync(FIXTURES_DIR)
		.filter((file) => file.endsWith(".json"))
		.map((file) => path.basename(file, ".json"));
}

function fixtureNumber(name: string, category: FixtureCategory): number {
	return Number(name.slice(category.length + 1));
}

function listCategoryNumbers(category: FixtureCategory): number[] {
	return listFixtureNames()
		.filter((name) => name.startsWith(`${category}_`))
		.map((name) => fixtureNumber(name, category))
		.filter((n) => !Number.isNaN(n));
}

export function countFixtures(category: FixtureCategory): number {
	return listCategoryNumbers(category).length;
}

export function nextFixtureName(category: FixtureCategory): string {
	const existing = listCategoryNumbers(category);
	const next = existing.length > 0 ? Math.max(...existing) + 1 : 1;

	return `${category}_${next}`;
}

/** The (already obfuscated) login stored in every fixture on disk. */
export function listFixtureLogins(): Set<string> {
	const logins = new Set<string>();

	for (const name of listFixtureNames()) {
		const content = fs.readFileSync(
			path.join(FIXTURES_DIR, `${name}.json`),
			"utf-8",
		);
		const login = JSON.parse(content).user?.login;
		if (typeof login === "string") {
			logins.add(login);
		}
	}

	return logins;
}

export function writeFixture(
	name: string,
	capturedAt: string,
	data: object,
): void {
	fs.mkdirSync(FIXTURES_DIR, { recursive: true });
	// capturedAt first: it pins the clock the fixture is replayed against.
	fs.writeFileSync(
		path.join(FIXTURES_DIR, `${name}.json`),
		JSON.stringify({ capturedAt, ...data }, null, "\t"),
	);
}

export function addToRegressionConfig(
	name: string,
	label: ClassificationLabel,
): void {
	let src = fs.readFileSync(REGRESSION_CONFIG_PATH, "utf-8");
	src = src.replace(/(\n\} satisfies)/, `\n\t"${name}": "${label}",$1`);
	fs.writeFileSync(REGRESSION_CONFIG_PATH, src, "utf-8");
}
