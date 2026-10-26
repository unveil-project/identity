import type { Analysis, Flag } from "../types";

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

export type ReportFlag<Source = unknown> = Flag<Source> & FlagText;

/** The classification from `classify`, plus the flags and numbers that led to it. */
export type Report<Source = unknown> = Omit<Analysis<Source>, "flags"> & {
	flags: ReportFlag<Source>[];
};
