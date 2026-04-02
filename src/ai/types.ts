import type { IdentifyResult } from "../types";

export type AIAnalysisInput = {
  token: string;
  model: string;
  username: string;
  analysis: IdentifyResult;
  accountCreatedAt: string;
  publicRepos: number;
  events: Record<string, unknown>[];
};

export type AIAnalysisResult = {
  classification: "organic" | "mixed" | "automation";
  confidence: number;
  reasoning: string;
};
