import { z } from "zod/mini";
import { buildUserPrompt, SYSTEM_PROMPT } from "./prompt";
import type { AIAnalysisInput, AIAnalysisResult } from "./types";

const aiAnalysisResultSchema = z.object({
  classification: z.enum(["organic", "mixed", "automation"]),
  confidence: z.number(),
  reasoning: z.string(),
});

export async function getAIAnalysis(input: AIAnalysisInput): Promise<AIAnalysisResult | null> {
  const { token, model = 'openai/gpt-4o-mini', username, analysis, accountCreatedAt, publicRepos, events, orgs } = input;
  const prompt = buildUserPrompt({ token, model, username, analysis, accountCreatedAt, publicRepos, events, orgs });

  // todo: extract into separate module for calling different AI providers and handling their specific quirks
  const response = await fetch(
    "https://models.github.ai/inference/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0.3,
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  let content = data.choices?.[0]?.message?.content?.trim() ?? null;
  if (!content) return null;

  if (model.includes("deepseek")) {
    // remove DeepSeek-R1 markers if present
    content = content.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  }

  return aiAnalysisResultSchema.parse(JSON.parse(content));
}
