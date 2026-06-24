import type { IdentityClassification } from "../src";

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

	"automation_3": "automation",
	"automation_8": "automation",
	"automation_5": "automation",
	"automation_6": "automation",
	"automation_4": "automation",
	"automation_10": "automation",
	"automation_9": "automation",
	"automation_7": "automation",
	"automation_11": "automation",
	"automation_1": "automation",
	"automation_12": "automation",
	"automation_2": "automation",
	"automation_13": {
		expected: "organic",
		knownAs: "automation"
	},
} satisfies Record<string, FixtureEntry>;

export type FixtureName = keyof typeof REGRESSION_FIXTURES;
