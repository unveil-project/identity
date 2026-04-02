import type { GitHubEvent, IdentifyResult } from "../types";

export type AIAnalysisInput = {
    /**
     * Your github token
     */
  token: string;
  /**
   * The AI model to use for analysis, e.g. "openai/gpt-4o" or "openai/gpt-4o-mini"
   * @default "openai/gpt-4o-mini"
   */
  model: string;
  /**
   * The username of the account to analyze
   */
  username: string;
  /**
   * The heuristic analysis result for the user, which the AI can use as part of its assessment but should not rely on exclusively. This includes the overall score, classification, and any flags that were raised based on the heuristic rules.
   * The AI should consider this information as one piece of evidence among many, but should primarily base its classification on the patterns observed in the user's events and activity data. The heuristic analysis may provide useful context, but the AI's assessment should be based on the actual behaviors and patterns in the data rather than just echoing the heuristic classification.
   */
  analysis?: IdentifyResult;
  /**
   * The date when the user's account was created
   */
  accountCreatedAt: string;
  /**
   * The number of public repositories the user has
   */
  publicRepos: number;
  /**
   * The events associated with the user's account
   */
  events: GitHubEvent[];
};

export type AIAnalysisResult = {
  classification: "organic" | "mixed" | "automation";
  confidence: number;
  reasoning: string;
};
