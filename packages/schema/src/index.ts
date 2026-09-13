import { z } from "zod";
import { CandidateSchema } from "./capabilities.js";

/**
 * Thrown by any subsystem whose live dependency is not configured.
 *
 * Hard rule: a missing live dependency must fail loudly with a name, never
 * fall back to mocked or canned data. The empty parameter names what is
 * missing so the operator knows which prerequisite to provision.
 */
export class NotImplementedError extends Error {
  constructor(what: string) {
    super(`Not implemented: ${what}`);
    this.name = "NotImplementedError";
  }
}

// ── Addresses ────────────────────────────────────────────────────────────────

export const AddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, "expected a 20-byte hex address (0x…)");
/** Exact template-literal type so EIP-712 typing is precise, not `string`. */
export type Address = `0x${string}`;
const addressField = (): z.ZodType<Address> =>
  z.custom<Address>(
    (v) => typeof v === "string" && /^0x[a-fA-F0-9]{40}$/.test(v),
    "expected a 20-byte hex address (0x…)",
  );

/** Assets that have a USD series from a confirmed Uniswap V3 venue (BTC = WBTC). */
export const MARKET_ASSETS = ["ETH", "BTC", "LINK", "UNI", "DAI", "USDC", "USDT"] as const;
export type MarketAsset = (typeof MARKET_ASSETS)[number];

const pairValues = MARKET_ASSETS.flatMap((base) =>
  MARKET_ASSETS.filter((quote) => quote !== base).map((quote) => `${base}/${quote}`),
);
export const MARKET_PAIRS = pairValues as [string, ...string[]];
export type MarketPair = (typeof MARKET_PAIRS)[number];

export const normalizeMarketPair = (raw: string): string =>
  raw.trim().toUpperCase().replaceAll("WBTC", "BTC").replaceAll("WETH", "ETH");

export const MarketPairSchema = z.enum(MARKET_PAIRS);

// ── UI the agent may request. Unknown type or out-of-policy bound = ZodError,
// ── surfaced in chat. Never a default fallback UI. ──────────────────────────

export const ComponentSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("price_chart"),
    pair: MarketPairSchema,
    range: z.enum(["24h", "7d"]),
  }),
  z.object({
    // Sums to 100; validated at the boundary when the spec is accepted.
    type: z.literal("allocation_selector"),
    assets: z.tuple([z.literal("ETH"), z.literal("USDC")]),
    defaultPct: z.tuple([z.number(), z.number()]),
  }),
  z.object({
    type: z.literal("range_slider"),
    id: z.literal("max_drawdown_pct"),
    min: z.number(),
    max: z.number(),
    default: z.number(),
  }),
  z.object({
    type: z.literal("amount_selector"),
    id: z.literal("max_trade_usd"),
    min: z.number(),
    max: z.number(),
    default: z.number(),
  }),
  z.object({
    type: z.literal("permission_toggle"),
    id: z.literal("allow_rebalance"),
    default: z.boolean(),
    consequence: z.string(),
  }),
  z.object({
    type: z.literal("risk_summary"),
    risk: z.lazy(() => RiskContextSchema),
    receiptTxId: z.string(),
  }),
  z.object({
    type: z.literal("protection_simulation"),
    deductibleUsd: z.number().nonnegative(),
    durationDays: z.number().positive(),
    premiumEstimateUsd: z.number().nonnegative(),
    labeled: z.literal("model_estimate"),
  }),
  z.object({
    type: z.literal("protection_knobs"),
    deductiblePct: z.number().nonnegative(),
    durationDays: z.number().positive(),
    budgetUsd: z.number().nonnegative(),
    strikeUsd: z.number().positive(),
    spotUsd: z.number().positive(),
  }),
  z.object({
    type: z.literal("payoff_chart"),
    spotUsd: z.number().positive(),
    strikeUsd: z.number().positive(),
    premiumUsd: z.number().nonnegative(),
    notionalUsd: z.number().nonnegative(),
    points: z
      .array(
        z.object({
          priceUsd: z.number(),
          unprotectedUsd: z.number(),
          protectedUsd: z.number(),
        }),
      )
      .min(8),
  }),
  z.object({
    type: z.literal("health_meter"),
    current: z.number().nonnegative(),
    threshold: z.number().positive(),
    liquidation: z.number().positive(),
    utilizationPct: z.number().nonnegative(),
    labeled: z.literal("model_estimate"),
  }),
  z.object({
    type: z.literal("execution_preview"),
    side: z.enum(["buy", "sell"]),
    base: z.literal("ETH"),
    quote: z.literal("USDC"),
    notionalUsd: z.number().nonnegative(),
    expectedPriceUsd: z.number().positive(),
    slippageBps: z.number().nonnegative(),
    poolTvlUsd: z.number().nonnegative(),
    remainingMandateUsd: z.number(),
    verdict: z.enum(["inside", "outside"]),
    reason: z.string(),
  }),
  z.object({
    type: z.literal("leverage_control"),
    enabled: z.boolean(),
    maxLeverage: z.number().positive(),
    stopRequired: z.literal(true),
    labeled: z.literal("simulated"),
  }),
  z.object({
    type: z.literal("strategy_comparison"),
    currentEthPct: z.number(),
    currentUsdcPct: z.number(),
    candidates: z.array(z.lazy(() => CandidateSchema)).min(1),
  }),
  z.object({
    type: z.literal("human_escalation"),
    blockedAction: z.string(),
    reason: z.string(),
    required: z.literal("wallet_signature"),
  }),
]);
export type Component = z.infer<typeof ComponentSchema>;

export const UISpecIntentSchema = z.enum([
  "configure_portfolio_guard",
  "configure_position_protection",
  "configure_collateral_guard",
  "confirm_spot_execution",
  "confirm_futures_execution",
  "compare_strategies",
  "needs_human",
]);
export type UISpecIntent = z.infer<typeof UISpecIntentSchema>;

export const UISpecSchema = z.object({
  intent: UISpecIntentSchema,
  components: z.array(ComponentSchema).min(1),
  rationale: z.string(),
});
export type UISpec = z.infer<typeof UISpecSchema>;

// mandate_signer is platform-owned: the renderer always appends it and it is
// deliberately NOT part of UISpec — the agent cannot ask for it.

// ── AP2-style OPEN mandate (human-not-present). Typed constraints, iat/exp,
// ── versioned kinds. Ours are AP2-STYLE, not AP2-compliant — the keys are
// ── xyz.custodia.* namespaced and the device layer is not part of v0. ───────

const CONSTRAINT_TYPES = [
  "custodia.max_notional_usd.1",
  "custodia.max_trade_usd.1",
  "custodia.max_drawdown_pct.1",
  "custodia.allowed_assets.1",
  "custodia.allow_rebalance.1",
  "custodia.max_premium_usd.1",
  "custodia.deductible_pct.1",
  "custodia.duration_days.1",
  "custodia.max_slippage_bps.1",
  "custodia.max_leverage.1",
  "custodia.min_health_factor.1",
  "custodia.require_stop.1",
] as const;

export const ConstraintTypeSchema = z.enum(CONSTRAINT_TYPES);
export type ConstraintType = z.infer<typeof ConstraintTypeSchema>;

export const ConstraintSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("custodia.max_notional_usd.1"), value: z.number() }),
  z.object({ type: z.literal("custodia.max_trade_usd.1"), value: z.number() }),
  z.object({ type: z.literal("custodia.max_drawdown_pct.1"), value: z.number() }),
  z.object({ type: z.literal("custodia.allowed_assets.1"), assets: z.array(z.string()) }),
  z.object({ type: z.literal("custodia.allow_rebalance.1"), value: z.boolean() }),
  z.object({ type: z.literal("custodia.max_premium_usd.1"), value: z.number() }),
  z.object({ type: z.literal("custodia.deductible_pct.1"), value: z.number() }),
  z.object({ type: z.literal("custodia.duration_days.1"), value: z.number() }),
  z.object({ type: z.literal("custodia.max_slippage_bps.1"), value: z.number() }),
  z.object({ type: z.literal("custodia.max_leverage.1"), value: z.number() }),
  z.object({ type: z.literal("custodia.min_health_factor.1"), value: z.number() }),
  z.object({ type: z.literal("custodia.require_stop.1"), value: z.boolean() }),
]);
export type Constraint = z.infer<typeof ConstraintSchema>;

export const MandateSchema = z.object({
  kind: z.literal("custodia.mandate.task.1"),
  taskId: z.string().regex(/^[0-9a-f]{8}$/, "taskId must be 8 hex chars"),
  owner: addressField(),
  agent: addressField(),
  ens: z.string().regex(/^[a-z0-9-]+\.(?:[a-z0-9-]+\.)+eth$/i, "expected an ens name"),
  constraints: z.array(ConstraintSchema),
  iat: z.number().int(),
  exp: z.number().int(),
});
export type Mandate = z.infer<typeof MandateSchema>;

// ── The action the agent proposes; the policy engine arbitrates it. ─────────

export const ProposedActionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("rebalance"),
    fromAsset: z.string(),
    toAsset: z.string(),
    notionalUsd: z.number().nonnegative(),
    reason: z.string(),
  }),
  z.object({
    kind: z.literal("pay_x402"),
    amountHbar: z.number().nonnegative(),
    endpoint: z.string().url(),
  }),
]);
export type ProposedAction = z.infer<typeof ProposedActionSchema>;

export const PolicyDecisionSchema = z.object({
  allowed: z.boolean(),
  reason: z.string(),
  violated: ConstraintTypeSchema.optional(),
});
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

// ── Market data (The Graph) and risk context (risk-api) — numbers never
// ── originate from the LLM. ─────────────────────────────────────────────────

export const MarketContextSchema = z.object({
  pair: MarketPairSchema,
  base: z.string(),
  quote: z.string(),
  poolId: z.string(),
  poolName: z.string(),
  priceUsd: z.number(),
  realizedVol24hPct: z.number(),
  tvlUsd: z.number(),
  hourly: z.array(z.object({ ts: z.number(), close: z.number() })).min(24),
  block: z.number().int(),
  sourceTimestamp: z.number().int().optional(),
  fetchedAt: z.number(),
});
export type MarketContext = z.infer<typeof MarketContextSchema>;

export const RiskContextSchema = z.object({
  volatility24hPct: z.number().nonnegative(),
  concentrationPct: z.number().nonnegative(),
  maxTradeEnvelopeUsd: z.number().nonnegative(),
  drawdownRange: z.tuple([z.number(), z.number()]),
  explanation: z.string(),
});
export type RiskContext = z.infer<typeof RiskContextSchema>;

export const RiskRequestInputSchema = z.object({
  assets: z.array(z.string()).min(1),
  sizeUsd: z.number().positive(),
  allocationPct: z.array(z.number().nonnegative()).min(1),
});
export type RiskRequestInput = z.infer<typeof RiskRequestInputSchema>;

export const ReceiptSchema = z.object({
  kind: z.enum(["x402", "ens_tx", "simulated", "paper"]),
  txId: z.string(),
  network: z.string(),
  amount: z.string().optional(),
  payload: z.unknown(),
});
export type Receipt = z.infer<typeof ReceiptSchema>;

export * from "./capabilities.js";
export * from "./chat-text.js";
// Task lifecycle v2 (seven states, actor-gated transitions) — see lifecycle.ts
export * from "./lifecycle.js";
// EIP-712 mandate domain/types + constraintsHash (see mandate712.ts)
export * from "./mandate712.js";
