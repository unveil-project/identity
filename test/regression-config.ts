/**
 * Regression Test Configuration
 * Defines known automations and organic accounts used for regression testing
 * Format: fixtureFileName (without .json) -> expected classification
 */

export const REGRESSION_FIXTURES = {
  automation_joannwalsh: "automation",
  automation_reedpurdy: "automation",
  automation_sheilaleffler: "mixed",
  user_claudiaschoen: "organic",
  user_elenahowe: "organic",
  user_robinsatterfield: "organic",
  user_shellychristiansen: "organic",
  user_vaughnjohnston: "organic",
} as const;

export type FixtureName = keyof typeof REGRESSION_FIXTURES;
export type ExpectedClassification = (typeof REGRESSION_FIXTURES)[FixtureName];
