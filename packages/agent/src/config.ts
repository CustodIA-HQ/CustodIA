import { NotImplementedError } from "@custodia/schema";

export interface AgentEnv {
  anthropicApiKey: string;
  riskApiUrl: string;
}

/**
 * Product LLM is Claude (claude-opus-5) via @anthropic-ai/sdk. The API key is
 * a hard prerequisite: without it the agent cannot run, and that must be loud.
 */
export const loadAgentEnv = (env: NodeJS.ProcessEnv = process.env): AgentEnv => {
  const anthropicApiKey = env.ANTHROPIC_API_KEY;
  if (!anthropicApiKey) {
    throw new NotImplementedError("ANTHROPIC_API_KEY");
  }
  return {
    anthropicApiKey,
    riskApiUrl: env.RISK_API_URL ?? "http://localhost:8402",
  };
};
