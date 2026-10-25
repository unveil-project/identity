import { analyze } from "../analyze";
import type { FlagFacts, IdentifyFlag, IdentifyInput } from "../types";
import { FLAG_TEXT } from "./flag-text";
import type { FlagText, IdentityReport, ReportFlag } from "./types";

export type {
	EventConnection,
	EvidenceGroup,
	FlagFacts,
	FlagId,
	IdentifyFlag,
	ScoredGroup,
	TimezoneEstimate,
	WindowInfo,
} from "../types";
export { getClassificationDetails } from "./classification";
export type {
	FlagDataPoint,
	FlagText,
	IdentityReport,
	ReportFlag,
} from "./types";

export function describeFlag(flag: IdentifyFlag): FlagText {
	const build = FLAG_TEXT[flag.id] as (
		facts: FlagFacts[IdentifyFlag["id"]],
	) => FlagText;

	return build(flag.facts);
}

/** Add a label, a sentence and a list of metrics to one flag. */
function toReportFlag<Source>(flag: IdentifyFlag<Source>): ReportFlag<Source> {
	return { ...flag, ...describeFlag(flag) };
}

/**
 * Score an account like `identify`, and also return every flag with its text,
 * the evidence groups, the event window and the timezone estimate.
 *
 * @example
 * import { report } from "@unveil/identity/report";
 *
 * const { score, flags } = report(fromGitHub({ user, events }));
 * flags[0].label; // "Fork spike detected"
 */
export function report<Source = unknown>(
	options: IdentifyInput<Source>,
): IdentityReport<Source> {
	const analysis = analyze(options);

	return {
		...analysis,
		flags: analysis.flags.map(toReportFlag),
	};
}
