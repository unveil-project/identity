import { analyze } from "../analyze";
import type { AccountInput, Flag, FlagFacts } from "../types";
import { FLAG_TEXT } from "./flag-text";
import type { FlagText, Report, ReportFlag } from "./types";

export type {
	EventConnection,
	EvidenceGroup,
	Flag,
	FlagFacts,
	FlagId,
	ScoredGroup,
	TimezoneEstimate,
	WindowInfo,
} from "../types";
export { getClassificationDetails } from "./classification";
export type {
	FlagDataPoint,
	FlagText,
	Report,
	ReportFlag,
} from "./types";

export function describeFlag(flag: Flag): FlagText {
	const build = FLAG_TEXT[flag.id] as (
		facts: FlagFacts[Flag["id"]],
	) => FlagText;

	return build(flag.facts);
}

/** Add a label, a sentence and a list of metrics to one flag. */
function toReportFlag<Source>(flag: Flag<Source>): ReportFlag<Source> {
	return { ...flag, ...describeFlag(flag) };
}

/**
 * Score an account like `classify`, and also return every flag with its text,
 * the evidence groups, the event window and the timezone estimate.
 *
 * @example
 * import { report } from "@unveil/identity/report";
 *
 * const { score, flags } = report(fromGitHub({ user, events }));
 * flags[0].label; // "Fork spike detected"
 */
export function report<Source = unknown>(
	options: AccountInput<Source>,
): Report<Source> {
	const analysis = analyze(options);

	return {
		...analysis,
		flags: analysis.flags.map(toReportFlag),
	};
}
