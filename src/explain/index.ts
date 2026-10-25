import type { FlagFacts, IdentifyFlag, IdentifyResult } from "../types";
import { FLAG_TEXT } from "./flag-text";
import type { ExplainedFlag, ExplainedResult, FlagText } from "./types";

export { getClassificationDetails } from "./classification";
export type {
	ExplainedFlag,
	ExplainedResult,
	FlagDataPoint,
	FlagText,
} from "./types";

/** The words for one flag, without the flag itself. */
export function describeFlag(flag: IdentifyFlag): FlagText {
	// Each id has its own facts shape, and FLAG_TEXT is typed per id, but
	// TypeScript cannot follow that link through a lookup by a union key.
	const build = FLAG_TEXT[flag.id] as (
		facts: FlagFacts[IdentifyFlag["id"]],
	) => FlagText;

	return build(flag.facts);
}

/** Add a label, a sentence and a list of metrics to one flag. */
export function explainFlag<Source>(
	flag: IdentifyFlag<Source>,
): ExplainedFlag<Source> {
	return { ...flag, ...describeFlag(flag) };
}

/**
 * Add the words to every flag in a result.
 *
 * @example
 * import { identify } from "@unveil/identity";
 * import { explain } from "@unveil/identity/explain";
 *
 * const { flags } = explain(identify(input));
 * flags[0].label; // "Fork spike detected"
 */
export function explain<Source>(
	result: IdentifyResult<Source>,
): ExplainedResult<Source> {
	return { ...result, flags: result.flags.map(explainFlag) };
}
