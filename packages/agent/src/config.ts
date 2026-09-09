import { NotImplementedError } from "@custodia/schema";

export interface AgentEnv {
  openaiApiKey: string;
  openaiModel: string;
  riskApiUrl: string;
}

/**
 * Default model for the 3-tool loop. Override with OPENAI_MODEL to move between
 * tiers (e.g. to stay inside a complimentary-token allowance) without a code
 * change.
 */
const DEFAULT_MODEL = "gpt-5-mini";

/**
 * Product LLM is OpenAI via the official `openai` SDK. The API key is a hard
 * prerequisite: without it the agent cannot run, and that must be loud.
 */
export const loadAgentEnv = (env: NodeJS.ProcessEnv = process.env): AgentEnv => {
  const openaiApiKey = env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new NotImplementedError("OPENAI_API_KEY");
  }
  return {
    openaiApiKey,
    openaiModel: env.OPENAI_MODEL ?? DEFAULT_MODEL,
    riskApiUrl: env.RISK_API_URL ?? "http://localhost:8402",
  };
};
