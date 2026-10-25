import { analyze } from "./analyze";
import type { IdentifyInput, IdentifyResult } from "./types";

/**
 * Score an account. Build the input with a provider, like `fromGitHub`.
 *
 * Returns only the verdict. Use `report` from `@unveil/identity/report` to see
 * the flags behind it.
 *
 * @example
 * identify(fromGitHub({ user, events }));
 */
export function identify(options: IdentifyInput): IdentifyResult {
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
