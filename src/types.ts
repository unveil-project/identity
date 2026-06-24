import type { Endpoints } from "@octokit/types";

export type GitHubUser = Endpoints["GET /users/{username}"]["response"]["data"];

export type GitHubEvent =
	Endpoints["GET /users/{username}/events/public"]["response"]["data"][number] & {
		payload?: {
			ref_type?: string;
			pull_request?: {
				number?: number;
				head?: {
					repo?: {
						url?: string;
					};
				};
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
};

export type IdentifyOptions = {
	createdAt: string;
	reposCount: number;
	accountName: string;
	events: GitHubEvent[];
	excludeRepos?: string[];
	commits?: GitHubCommit[];
};

export type IdentityClassification = "organic" | "mixed" | "automation";

export type IdentifyResult = {
	score: number;
	classification: IdentityClassification;
	isBountyHunter: boolean;
	flags: IdentifyFlag[];
	profile: {
		age: number;
		repos: number;
	};
};

export type FlagReturn = {
	flags: IdentifyFlag[];
};
