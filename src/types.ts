import type { Endpoints } from "@octokit/types";

export type GitHubUser = Endpoints["GET /users/{username}"]["response"]["data"];

export type GitHubEvent =
	Endpoints["GET /users/{username}/events/public"]["response"]["data"][number] & {
		payload?: {
			ref_type?: string;
			pull_request?: {
				number?: number;
				[key: string]: unknown;
			};
			[key: string]: unknown;
		};
	};

export type GitHubCommit = {
	sha?: string;
	message?: string;
	repo?: string;
};

export type IdentifyFlag = {
	label: string;
	points: number;
	detail: string;
	amplifiable?: boolean;
	eventBased?: boolean;
};

export type IdentifyProfile = {
	followers: number;
	name?: string | null;
	company?: string | null;
	location?: string | null;
	blog?: string | null;
	bio?: string | null;
};

export type IdentifyOptions = {
	createdAt: string;
	reposCount: number;
	accountName: string;
	events: GitHubEvent[];
	excludeRepos?: string[];
	commits?: GitHubCommit[];
};

export type IdentityClassification =
	| "organic"
	| "mixed"
	| "automation"
	| "legitimate_automation"
	| "likely_spam";

export type IdentifyResult = {
	score: number;
	confidence: number;
	classification: IdentityClassification;
	flags: IdentifyFlag[];
	profile: {
		age: number;
		repos: number;
	};
};

export type FlagReturn = {
	flags: IdentifyFlag[];
};
