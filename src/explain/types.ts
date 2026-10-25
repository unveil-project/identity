import type { IdentifyFlag, IdentifyResult } from "../types";

export type FlagDataPoint = {
	label: string;
	value: number | string | boolean;
	threshold?: number | string;
};

/** The words for one flag: a short label, one sentence, and its metrics. */
export type FlagText = {
	label: string;
	detail: string;
	data: FlagDataPoint[];
};

export type ExplainedFlag<Source = unknown> = IdentifyFlag<Source> & FlagText;

export type ExplainedResult<Source = unknown> = Omit<
	IdentifyResult<Source>,
	"flags"
> & {
	flags: ExplainedFlag<Source>[];
};
