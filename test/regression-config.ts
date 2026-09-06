import type { IdentityClassification } from "../src";

/**
 * What the account really is. Fixture files are named `<category>_<n>.json`,
 * so the category is part of the file name and never drifts from the data.
 *
 * "github-app" is not a classification: identify() still scores those accounts
 * like any other, but GitHub itself reports them as `type: "Bot"`, so they are
 * additionally gated on `isGitHubApp`.
 */
export type FixtureCategory =
	| "organic"
	| "mixed"
	| "automation"
	| "github-app";

export const FIXTURE_CATEGORIES: FixtureCategory[] = [
	"organic",
	"mixed",
	"automation",
	"github-app",
];

export function getCategory(
	fixtureName: string,
): FixtureCategory | undefined {
	const prefix = fixtureName.slice(0, fixtureName.lastIndexOf("_"));
	return FIXTURE_CATEGORIES.find((category) => category === prefix);
}

/**
 * Whether identify() must report this fixture as a GitHub App. Fixtures in
 * every other category must report `false`, so a bot filed under the wrong
 * category fails just as loudly as a missed one.
 */
export function expectsGitHubApp(fixtureName: string): boolean {
	return getCategory(fixtureName) === "github-app";
}

/**
 * A fixture where the system's current output differs from the known ground truth.
 * `expected` is what identify() produces (the test gate — fail if it changes).
 * `knownAs` is what the account truly is — warns if the system hasn't caught up yet.
 */
export interface KnownMisclassification {
	expected: IdentityClassification;
	knownAs: IdentityClassification;
}

export type FixtureEntry = IdentityClassification | KnownMisclassification;

export function getExpected(entry: FixtureEntry): IdentityClassification {
	return typeof entry === "string" ? entry : entry.expected;
}

export function getKnownAs(
	entry: FixtureEntry,
): IdentityClassification | undefined {
	return typeof entry === "string" ? undefined : entry.knownAs;
}

export const REGRESSION_FIXTURES = {
	"organic_1": "organic",
	"organic_2": "organic",
	"organic_7": "organic",
	"organic_10": "organic",
	"organic_6": "organic",
	"organic_12": "organic",
	"organic_8": "organic",
	"organic_5": "organic",
	"organic_9": "organic",
	"organic_11": "organic",
	"organic_3": "organic",
	"organic_4": "organic",
	"organic_13": "organic",
	"organic_14": "organic",

	"automation_3": "automation",
	"automation_8": "automation",
	"automation_5": "automation",
	"automation_6": "automation",
	"automation_4": {
		"expected": "mixed",
		"knownAs": "automation",
	},
	"automation_10": "automation",
	"automation_9": "automation",
	"automation_7": "automation",
	"automation_11": "automation",
	"automation_1": "automation",
	"automation_12": "automation",
	"automation_2": "automation",
	"automation_13": "automation",
	"automation_14": "automation",
	"automation_15": "automation",
	"automation_16": "automation",
	"automation_17": "automation",
	"automation_18": {
		"expected": "mixed",
		"knownAs": "automation",
	},
	"automation_19": "automation",
	"automation_20": "automation",
	"organic_15": "organic",
	"organic_16": "organic",
	"organic_17": "organic",
	"organic_18": "organic",
	"organic_19": "organic",
	"github-app_1": "automation",
	"github-app_2": "automation",
	"github-app_3": "automation",
} satisfies Record<string, FixtureEntry>;

export type FixtureName = keyof typeof REGRESSION_FIXTURES;
