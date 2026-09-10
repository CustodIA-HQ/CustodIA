import { NotImplementedError } from "@custodia/schema";

export interface AgentEnv {
  openaiApiKey: string;
  openaiModel: string;
  reasoningEffort?: ReasoningEffort;
  riskApiUrl: string;
}

const REASONING_EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

/**
 * Default model for the 3-tool loop: GPT-5.6 Luna, the cheapest tier
 * ($0.20 / $1.20 per 1M tokens). The loop is a rigid three-step, strict-schema
 * task, which is what this tier is built for. Override with OPENAI_MODEL
 * (e.g. gpt-5.6-terra for a demo recording) without a code change.
 * Function tools on Luna require reasoning_effort="none"; loadAgentEnv
 * normalizes that combination so a stale local override cannot break chat.
 */
const DEFAULT_MODEL = "gpt-5.6-luna";

/**
 * Product LLM is OpenAI via the official `openai` SDK. The API key is a hard
 * prerequisite: without it the agent cannot run, and that must be loud.
 */
export const loadAgentEnv = (env: NodeJS.ProcessEnv = process.env): AgentEnv => {
  const openaiApiKey = env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    throw new NotImplementedError("OPENAI_API_KEY");
  }
  const effort = env.OPENAI_REASONING_EFFORT;
  if (effort && !REASONING_EFFORTS.includes(effort as ReasoningEffort)) {
    throw new Error(
      `OPENAI_REASONING_EFFORT="${effort}" is not one of ${REASONING_EFFORTS.join(", ")}`,
    );
  }
  const openaiModel = env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
  return {
    openaiApiKey,
    openaiModel,
    reasoningEffort:
      openaiModel === DEFAULT_MODEL ? "none" : (effort as ReasoningEffort | undefined),
    riskApiUrl: env.RISK_API_URL ?? "http://localhost:8402",
  };
};
