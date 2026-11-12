import type { ClassificationLabel } from "../src";

/**
 * What the account really is. Fixture files are named `<category>_<n>.json`,
 * so the category is part of the file name and never drifts from the data.
 *
 * "github-app" is not a classification: classify() still scores those accounts
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
 * Whether classify() must report this fixture as a GitHub App. Fixtures in
 * every other category must report `false`, so a bot filed under the wrong
 * category fails just as loudly as a missed one.
 */
export function expectsGitHubApp(fixtureName: string): boolean {
	return getCategory(fixtureName) === "github-app";
}

/**
 * A fixture where the system's current output differs from the known ground truth.
 * `expected` is what classify() produces (the test gate — fail if it changes).
 * `knownAs` is what the account truly is — warns if the system hasn't caught up yet.
 */
export interface KnownMisclassification {
	expected: ClassificationLabel;
	knownAs: ClassificationLabel;
}

export type FixtureEntry = ClassificationLabel | KnownMisclassification;

export function getExpected(entry: FixtureEntry): ClassificationLabel {
	return typeof entry === "string" ? entry : entry.expected;
}

export function getKnownAs(
	entry: FixtureEntry,
): ClassificationLabel | undefined {
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
	"automation_4": "automation",
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
	"automation_18": "automation",
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
	"organic_20": "organic",
	"organic_21": "organic",
	"organic_22": "organic",
	"organic_23": "organic",
	"organic_24": "organic",
	"organic_25": "organic",
	"mixed_1": "mixed",
	"mixed_2": "mixed",
	"mixed_3": "mixed",
	"mixed_4": "mixed",
	"mixed_5": "mixed",
	"mixed_6": "mixed",
	"mixed_7": "mixed",
	"mixed_8": "mixed",
	"mixed_9": "mixed",
	"automation_26": "automation",
	"mixed_11": "mixed",
	"mixed_12": "mixed",
	"organic_26": "organic",
	"mixed_14": "mixed",
	"mixed_15": "mixed",
	"mixed_16": "mixed",
	"mixed_17": "mixed",
	"mixed_18": "mixed",
	"mixed_19": "mixed",
	"organic_27": "organic",
	"mixed_21": "mixed",
	"organic_28": "organic",
	"organic_29": "organic",
	"mixed_24": "mixed",
	"mixed_25": "mixed",
	"automation_21": { expected: "mixed", knownAs: "automation" },
	"automation_22": "automation",
	"automation_23": "automation",
	"automation_24": "automation",
	"automation_25": "automation",
	"organic_30": "organic",
	"organic_31": "organic",
	"organic_32": "organic",
	"organic_33": "organic",
	"organic_34": "organic",
	"organic_35": "organic",
	"organic_36": "organic",
	"organic_37": "organic",
	"organic_38": "organic",
	"organic_39": "organic",
	"organic_40": "organic",
	"organic_41": "organic",
	"organic_42": "organic",
	"organic_43": "organic",
	"organic_44": "organic",
	"organic_45": "organic",
	"mixed_71": "mixed",
	"organic_47": "organic",
	"organic_48": "organic",
	"organic_49": "organic",
	"organic_50": "organic",
	"automation_51": "automation",
	"mixed_27": "mixed",
	"mixed_28": "mixed",
	"mixed_29": "mixed",
	"mixed_30": "mixed",
	"mixed_31": "mixed",
	"mixed_32": "mixed",
	"organic_51": "organic",
	"mixed_34": "mixed",
	"mixed_35": "mixed",
	"automation_52": "automation",
	"mixed_37": "mixed",
	"mixed_38": "mixed",
	"mixed_39": "mixed",
	"mixed_40": "mixed",
	"mixed_41": "mixed",
	"organic_52": "organic",
	"organic_53": "organic",
	"organic_54": "organic",
	"automation_53": "automation",
	"mixed_46": "mixed",
	"organic_55": "organic",
	"mixed_48": "mixed",
	"mixed_49": "mixed",
	"automation_54": "automation",
	"mixed_51": "mixed",
	"mixed_52": "mixed",
	"mixed_53": "mixed",
	"mixed_54": "mixed",
	"mixed_55": "mixed",
	"automation_27": "automation",
	"automation_28": "automation",
	"automation_29": "automation",
	"automation_30": "automation",
	"automation_31": "automation",
	"automation_32": "automation",
	"automation_33": "automation",
	"automation_34": "automation",
	"automation_35": "automation",
	"automation_36": "automation",
	"automation_37": "automation",
	"automation_38": "automation",
	"automation_39": "automation",
	"automation_40": "automation",
	"automation_41": "automation",
	"automation_42": "automation",
	"organic_56": "organic",
	"automation_44": "automation",
	"automation_45": "automation",
	"automation_46": "automation",
	"automation_47": "automation",
	"automation_48": "automation",
	"automation_49": "automation",
	"automation_50": "automation",
	"mixed_56": "mixed",
	"mixed_57": "mixed",
	"organic_57": "organic",
	"organic_58": "organic",
	"mixed_60": "mixed",
	"organic_59": "organic",
	"mixed_62": "mixed",
	"organic_60": "organic",
	"mixed_64": "mixed",
	"mixed_65": "mixed",
	"mixed_66": "mixed",
	"mixed_67": "mixed",
	"mixed_68": "mixed",
} satisfies Record<string, FixtureEntry>;

export type FixtureName = keyof typeof REGRESSION_FIXTURES;
