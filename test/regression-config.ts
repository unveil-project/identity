import type { IdentityClassification } from "../src";

/**
 * Regression Test Configuration
 * Defines known automations and organic accounts used for regression testing
 * Format: fixtureFileName (without .json) -> expected classification
 */
export const REGRESSION_FIXTURES = {
	danielroe: "organic",
	matteogabriele: "organic",
	"patak-cat": "organic",
	graphieros: "organic",
	"huang-julien": "organic",
	gameroman: "organic",
	"sheremet-va": "organic",
	ematipico: "organic",
	trueberryless: "organic",
	ghostdevv: "organic",
	"43081j": "organic",
	alexdln: "organic",

	TIR44: "automation",
	Nexory: "automation",
	"Sean-Kenneth-Doherty": "automation",
	testuzerz123: "automation",
	"truffle-dev": "automation",
	mzl2233: "automation",
	nanookclaw: "automation",
	orbisai0security: "automation",
	fallintoplace: "automation",
	LeSingh1: "automation",
	atom00blue: "automation",
	ssdwgg: "automation",
} as const satisfies Record<string, IdentityClassification>;

export type FixtureName = keyof typeof REGRESSION_FIXTURES;
export type ExpectedClassification = (typeof REGRESSION_FIXTURES)[FixtureName];
