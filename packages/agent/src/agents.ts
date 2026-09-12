/**
 * Multi-agent decomposition for CustodIA.
 *
 * Three pure functions; no shared mutable state between them.
 *   IntentAgent  — keyword-routes the user message to an Intent
 *   MarketAgent  — fires Graph + Risk API in parallel
 *   UISpecAgent  — validates and clips the emitted UISpec
 *
 * The monolithic runAgent in index.ts is kept intact so the worker handler
 * continues to work. These helpers are imported by the chat handler when
 * it wants to stream individual stage results without waiting for the full
 * pipeline.
 */

import { getMarketContext } from "@custodia/graph";
import {
  type Intent,
  type MarketContext,
  type MarketPair,
  type RiskContext,
  UISpecSchema,
} from "@custodia/schema";
import { clipUISpec } from "./clipper.js";
import { classifyIntent } from "./router.js";

// ─── IntentAgent ──────────────────────────────────────────────────────────────

export interface IntentResult {
  intent: Intent;
  /** Protocols the downstream MarketAgent should query. */
  protocols: Array<"uniswap" | "aave">;
}

/**
 * Deterministic: no LLM call, no I/O. Maps the user's last message to an
 * Intent and derives which on-chain protocols are relevant.
 */
export function intentAgent(messages: Array<{ role: string; content: string }>): IntentResult {
  const last = [...messages].reverse().find((m) => m.role === "user");
  const text = last?.content ?? "";
  const intent = classifyIntent(text);

  const protocols: IntentResult["protocols"] = [];
  if (intent === "guard" || intent === "protect" || intent === "research" || intent === "execute") {
    protocols.push("uniswap");
  }
  if (intent === "collateral") {
    protocols.push("aave");
    protocols.push("uniswap"); // need ETH price to USD-quote collateral
  }

  return { intent, protocols };
}

// ─── MarketAgent ──────────────────────────────────────────────────────────────

export interface MarketAgentInput {
  protocols: IntentResult["protocols"];
  /** Wallet address to look up Aave collateral (required when protocols includes 'aave'). */
  ownerWallet?: string;
  /** Optional Graph Studio API key override (defaults to env). */
  graphKey?: string;
}

export interface MarketAgentResult {
  /** ETH/USDC market context — always present when uniswap is in protocols. */
  market: MarketContext | null;
  /** Aave health factor / collateral USD — present when aave is in protocols. */
  aave: { totalCollateralUSD: string; healthFactor: string } | null;
}

/**
 * Fires The Graph (Uniswap) and Aave in parallel via Promise.all.
 * Neither call waits for the other; failures are isolated.
 */
export async function marketAgent(input: MarketAgentInput): Promise<MarketAgentResult> {
  const { protocols, ownerWallet } = input;

  const uniswapTask: Promise<MarketContext | null> = protocols.includes("uniswap")
    ? getMarketContext("ETH/USDC" as MarketPair).catch(() => null)
    : Promise.resolve(null);

  const aaveTask: Promise<MarketAgentResult["aave"]> =
    protocols.includes("aave") && ownerWallet
      ? import("./aave-helper.js").then((m) => m.getAaveData(ownerWallet)).catch(() => null)
      : Promise.resolve(null);

  const [market, aave] = await Promise.all([uniswapTask, aaveTask]);
  return { market, aave };
}

// ─── UISpecAgent ──────────────────────────────────────────────────────────────

export interface UISpecAgentInput {
  /** Raw component array from the LLM (pre-validation). */
  components: unknown[];
  rationale: string;
  intent: Intent;
  risk: RiskContext | null;
  receiptTxId: string | null;
}

export type UISpecAgentResult =
  | { ok: true; spec: ReturnType<typeof UISpecSchema.parse> }
  | { ok: false; error: string };

/**
 * Validates the component array through Zod, clips numeric bounds to the
 * risk context, then validates once more so the accepted spec is always
 * Zod-valid by construction. Returns a tagged union — never throws.
 */
export function uiSpecAgent(input: UISpecAgentInput): UISpecAgentResult {
  const withSummary =
    input.risk && input.receiptTxId
      ? [
          ...input.components.filter(
            (c: unknown) => (c as { type?: string } | null)?.type !== "risk_summary",
          ),
          { type: "risk_summary", risk: input.risk, receiptTxId: input.receiptTxId },
        ]
      : input.components;

  const candidate = {
    intent: "configure_portfolio_guard" as const,
    components: withSummary,
    rationale: input.rationale,
  };

  const shaped = UISpecSchema.safeParse(candidate);
  if (!shaped.success) {
    return { ok: false, error: shaped.error.message };
  }

  const clipped = input.risk ? clipUISpec(shaped.data, input.risk) : shaped.data;
  const accepted = UISpecSchema.safeParse(clipped);
  if (!accepted.success) {
    return { ok: false, error: accepted.error.message };
  }

  return { ok: true, spec: accepted.data };
}

// ─── Policy guard (reusable across agents) ───────────────────────────────────

export { evaluate as checkPolicy } from "@custodia/policy";
