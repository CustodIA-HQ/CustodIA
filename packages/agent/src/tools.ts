import { getMarketContext, type MarketCache } from "@custodia/graph";
import { evaluate } from "@custodia/policy";
import type { MarketPair, RiskContext } from "@custodia/schema";
import { type Mandate, type ProposedAction, UISpecSchema } from "@custodia/schema";

/**
 * The Mandate authorizing an agent action is normally signed by the human
 * AFTER the agent proposes. For the pre-payment check the agent stands in for
 * the human with a wide-open provisional mandate: only the task-wide HBAR
 * budget applies for v0. The signed mandate is enforced when actions execute.
 */
export const makePreflightMandate = (agent: `0x${string}`, owner: `0x${string}`): Mandate => ({
  kind: "custodia.mandate.task.1",
  taskId: "preflight",
  owner,
  agent,
  ens: "preflight.custodia.eth",
  constraints: [], // no per-transaction constraints pre-signature
  iat: 0,
  exp: 2 ** 31 - 1, // far future
});

/**
 * The three agent tools. Tool inputs are parsed from JSON at the SDK boundary
 * (never string-matched); outputs are the raw domain objects the model cites.
 * Bounds are clipped server-side by `clipUISpec` in agent.ts before the spec
 * is accepted.
 */

export interface MarketToolInput {
  pair: MarketPair;
}

export const getMarketContextTool = async (input: MarketToolInput, cache?: MarketCache) =>
  getMarketContext(input.pair, cache ? { cache } : {});

export interface RiskRequestToolInput {
  assets: string[];
  sizeUsd: number;
  allocationPct: number[];
}

export interface RiskToolDeps {
  /** The mandate authorizing the payment — preflight budget check only in v0. */
  mandate: Mandate;
  state: { spentUsd: number; now: number };
  /** Callback that performs the paid round-trip against the risk service. */
  pay: (input: RiskRequestToolInput) => Promise<RiskContext>;
}

/**
 * Policy check runs BEFORE any money moves: paying for risk is itself a
 * ProposedAction of kind pay_x402, so it goes through evaluate() first. A
 * denial is returned to the model as a tool result — the agent must explain
 * it and stop, not retry.
 */
export const paidRiskRequestTool = async (
  input: RiskRequestToolInput,
  deps: RiskToolDeps,
): Promise<{ denied: true; reason: string } | { denied: false; risk: RiskContext }> => {
  const action: ProposedAction = {
    kind: "pay_x402",
    amountHbar: 0.1, // HBAR cost of one risk call — visible in the price tag
    endpoint: process.env.RISK_API_URL ?? "http://localhost:8402/risk/portfolio",
  };
  const decision = evaluate(deps.mandate, action, deps.state);
  if (!decision.allowed) {
    return { denied: true, reason: decision.reason };
  }
  const risk = await deps.pay(input);
  return { denied: false, risk };
};

export interface EmitUiSpecInput {
  intent: "configure_portfolio_guard";
  components: unknown[];
  rationale: string;
}

/**
 * Zod validation is the acceptance gate: an invalid UISpec is an error shown
 * in chat — there is no retry-with-default-UI path. The model never emits
 * code; a spec is data, validated here.
 */
export function parseUISpec(input: EmitUiSpecInput): ReturnType<typeof UISpecSchema.parse> {
  return UISpecSchema.parse(input);
}
