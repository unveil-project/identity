import type { Analysis, IdentifyFlag } from "../types";

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

export type ReportFlag<Source = unknown> = IdentifyFlag<Source> & FlagText;

/** The verdict from `identify`, plus the flags and numbers that led to it. */
export type IdentityReport<Source = unknown> = Omit<
	Analysis<Source>,
	"flags"
> & {
	flags: ReportFlag<Source>[];
};
