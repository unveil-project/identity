import { analyze } from "./analyze";
import type { AccountInput, Classification } from "./types";

/**
 * Score an account. Build the input with a provider, like `fromGitHub`.
 *
 * Returns only the classification. Use `report` from `@unveil/identity/report` to see
 * the flags behind it.
 *
 * @example
 * classify(fromGitHub({ user, events }));
 */
export function classify(options: AccountInput): Classification {
	const { score, classification, confidence, isBountyHunter, isGitHubApp } =
		analyze(options);

	return {
		score,
		classification,
		confidence,
		isBountyHunter,
		isGitHubApp,
	};
}
