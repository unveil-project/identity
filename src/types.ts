import type { Endpoints } from "@octokit/types";

export type GitHubUser = Endpoints["GET /users/{username}"]["response"]["data"];

export type GitHubEvent =
  Endpoints["GET /users/{username}/events/public"]["response"]["data"][number] & {
    payload?: {
      ref_type?: string;
      [key: string]: unknown;
    };
  };

export type IdentifyFlag = {
  label: string;
  points: number;
  detail: string;
};

export type IdentifyOptions = {
  createdAt: string;
  reposCount: number;
  accountName: string;
  events: GitHubEvent[];
  excludeRepos?: string[];
};

export type IdentityClassification = "organic" | "mixed" | "automation";

export type IdentifyResult = {
  score: number;
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
