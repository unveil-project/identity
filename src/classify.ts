import { analyze } from "./analyze";
import type { AccountInput, AnalyzeOptions, Classification } from "./types";

/**
 * Score an account. Build the input with a provider, like `fromGitHub`.
 *
 * Returns only the classification. Use `report` from `@unveil/identity/report` to see
 * the flags behind it.
 *
 * @example
 * classify(fromGitHub({ user, events }));
 *
 * // Only look at repos the account cannot push to.
 * classify(fromGitHub({ user, events }), { scope: "read-only" });
 */
export function classify(
	input: AccountInput,
	options: AnalyzeOptions = {},
): Classification {
	const { score, classification, confidence, isBountyHunter, isGitHubApp } =
		analyze(input, options);

	return {
		score,
		classification,
		confidence,
		isBountyHunter,
		isGitHubApp,
	};
}
