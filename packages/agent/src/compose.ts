import { enumerateCandidates, filterFeasible } from "@custodia/decision";
import type {
  Intent,
  MarketContext,
  RiskContext,
  TaskTemplate,
  UISpec,
  UISpecIntent,
} from "@custodia/schema";
import { intentForTemplate, templateForIntent } from "@custodia/schema";

export interface ComposePortfolio {
  eth?: string;
  usdc?: string;
}

export interface ComposeInput {
  intent: Intent;
  market: MarketContext;
  risk: RiskContext | null;
  portfolio: ComposePortfolio;
  message: string;
  receiptTxId?: string | null;
}

const round2 = (value: number): number => Math.round(value * 100) / 100;

const holdingsUsd = (portfolio: ComposePortfolio, priceUsd: number) => {
  const ethUsd = Number(portfolio.eth ?? 0) * priceUsd;
  const usdcUsd = Number(portfolio.usdc ?? 0);
  const eth = Number.isFinite(ethUsd) ? ethUsd : 0;
  const usdc = Number.isFinite(usdcUsd) ? usdcUsd : 0;
  return { ethUsd: eth, usdcUsd: usdc, totalUsd: eth + usdc };
};

const parseDeductiblePct = (message: string, fallback: number): number => {
  const match = message.match(/(\d+(?:\.\d+)?)\s*%/);
  const raw = Number(match?.[1]);
  return Number.isFinite(raw) && raw > 0 && raw < 90 ? raw : fallback;
};

const parseNotionalUsd = (
  message: string,
  fallback: number,
): { side: "buy" | "sell"; notionalUsd: number } => {
  const buy = message.match(/\b(?:buy|compra|swap)\b.*?(\d+(?:\.\d+)?)/i);
  const sell = message.match(/\b(?:sell|cierra|close)\b/i);
  const amount = message.match(/(\d+(?:\.\d+)?)\s*(?:usdc|usd|\$)/i);
  const raw = Number(amount?.[1] ?? buy?.[1] ?? fallback);
  const notionalUsd = Number.isFinite(raw) && raw > 0 ? raw : fallback;
  return { side: sell && !buy ? "sell" : "buy", notionalUsd };
};

const payoffPoints = (
  spotUsd: number,
  strikeUsd: number,
  premiumUsd: number,
  notionalUsd: number,
) => {
  const points = [];
  for (let pct = 50; pct <= 130; pct += 4) {
    const priceUsd = round2(spotUsd * (pct / 100));
    const unprotectedUsd = round2(((priceUsd - spotUsd) / spotUsd) * notionalUsd);
    const cover = Math.max(strikeUsd - priceUsd, 0);
    const protectedUsd = round2(unprotectedUsd + (cover / spotUsd) * notionalUsd - premiumUsd);
    points.push({ priceUsd, unprotectedUsd, protectedUsd });
  }
  return points;
};

const spec = (
  intent: UISpecIntent,
  rationale: string,
  components: UISpec["components"],
): UISpec => ({
  intent,
  rationale,
  components,
});

export function composeUISpec(input: ComposeInput): UISpec | null {
  const template = templateForIntent(input.intent);
  if (!template) return null;
  switch (template) {
    case "position_protection":
      return composeProtection(input);
    case "collateral_guard":
      return composeCollateral(input);
    case "spot_execution":
      return composeSpot(input);
    case "futures_execution":
      return composeFutures(input);
    case "strategy_compare":
      return composeCompare(input);
    default:
      return composePortfolio(input);
  }
}

export function composeNeedsHuman(blockedAction: string, reason: string): UISpec {
  return spec("needs_human", reason, [
    {
      type: "human_escalation",
      blockedAction,
      reason,
      required: "wallet_signature",
    },
  ]);
}

function composePortfolio(input: ComposeInput): UISpec | null {
  if (!input.risk) return null;
  const { ethUsd, totalUsd } = holdingsUsd(input.portfolio, input.market.priceUsd);
  const ethPct = totalUsd > 0 ? Math.round((ethUsd / totalUsd) * 100) : 50;
  const [lo, hi] = input.risk.drawdownRange;
  const tradeMax = Math.max(0, Math.round(input.risk.maxTradeEnvelopeUsd));
  return spec("configure_portfolio_guard", input.risk.explanation, [
    { type: "price_chart", pair: input.market.pair, range: "24h" },
    { type: "allocation_selector", assets: ["ETH", "USDC"], defaultPct: [ethPct, 100 - ethPct] },
    {
      type: "range_slider",
      id: "max_drawdown_pct",
      min: lo,
      max: hi,
      default: Math.min(hi, Math.max(lo, round2((lo + hi) / 2))),
    },
    {
      type: "amount_selector",
      id: "max_trade_usd",
      min: 0,
      max: tradeMax,
      default: Math.round(tradeMax / 2),
    },
    {
      type: "permission_toggle",
      id: "allow_rebalance",
      default: false,
      consequence: "The agent may rebalance ETH/USDC only inside the signed trade envelope.",
    },
    {
      type: "risk_summary",
      risk: input.risk,
      receiptTxId: input.receiptTxId ?? "pending",
    },
  ]);
}

function composeProtection(input: ComposeInput): UISpec {
  const { totalUsd } = holdingsUsd(input.portfolio, input.market.priceUsd);
  const notionalUsd = Math.max(totalUsd, 1);
  const fromRisk = input.risk ? Math.max(5, Math.round(input.risk.drawdownRange[1])) : 15;
  const deductiblePct = parseDeductiblePct(input.message, fromRisk);
  const durationDays = 30;
  const budgetUsd = Math.max(
    1,
    Math.round(Math.min(40, (input.risk?.maxTradeEnvelopeUsd ?? 40) * 0.05, notionalUsd * 0.04)),
  );
  const spotUsd = input.market.priceUsd;
  const strikeUsd = round2(spotUsd * (1 - deductiblePct / 100));
  const rationale =
    input.risk?.explanation ??
    `Protection floor ${deductiblePct}% below live ${input.market.pair}, duration ${durationDays} days, budget $${budgetUsd}.`;
  return spec("configure_position_protection", rationale, [
    { type: "price_chart", pair: input.market.pair, range: "24h" },
    {
      type: "protection_knobs",
      deductiblePct,
      durationDays,
      budgetUsd,
      strikeUsd,
      spotUsd,
    },
    {
      type: "payoff_chart",
      spotUsd,
      strikeUsd,
      premiumUsd: budgetUsd,
      notionalUsd: round2(notionalUsd),
      points: payoffPoints(spotUsd, strikeUsd, budgetUsd, notionalUsd),
    },
    {
      type: "protection_simulation",
      deductibleUsd: round2(notionalUsd * (deductiblePct / 100)),
      durationDays,
      premiumEstimateUsd: budgetUsd,
      labeled: "model_estimate",
    },
    ...(input.risk
      ? [
          {
            type: "risk_summary" as const,
            risk: input.risk,
            receiptTxId: input.receiptTxId ?? "pending",
          },
        ]
      : []),
  ]);
}

function composeCollateral(input: ComposeInput): UISpec {
  const concentration = input.risk?.concentrationPct ?? 60;
  const vol = input.risk?.volatility24hPct ?? input.market.realizedVol24hPct;
  const current = round2(Math.max(1.05, 2.2 - concentration / 100 - vol / 25));
  const threshold = 1.35;
  const liquidation = 1;
  const utilizationPct = round2(Math.min(95, 100 / current));
  return spec(
    "configure_collateral_guard",
    "Health-factor guard from live concentration and realized volatility. Not a live lending position.",
    [
      { type: "price_chart", pair: input.market.pair, range: "24h" },
      {
        type: "health_meter",
        current,
        threshold,
        liquidation,
        utilizationPct,
        labeled: "model_estimate",
      },
      {
        type: "range_slider",
        id: "max_drawdown_pct",
        min: input.risk?.drawdownRange[0] ?? 3,
        max: input.risk?.drawdownRange[1] ?? 12,
        default: input.risk?.drawdownRange[1] ?? 12,
      },
      ...(input.risk
        ? [
            {
              type: "risk_summary" as const,
              risk: input.risk,
              receiptTxId: input.receiptTxId ?? "pending",
            },
          ]
        : []),
    ],
  );
}

function composeSpot(input: ComposeInput): UISpec {
  const envelope = input.risk?.maxTradeEnvelopeUsd ?? Math.min(500, input.market.tvlUsd * 0.02);
  const parsed = parseNotionalUsd(input.message, Math.min(500, envelope));
  const impact = envelope > 0 ? parsed.notionalUsd / Math.max(input.market.tvlUsd, 1) : 0;
  const slippageBps = round2(Math.max(1, impact * 10_000));
  const expectedPriceUsd = round2(
    input.market.priceUsd *
      (parsed.side === "buy" ? 1 + slippageBps / 10_000 : 1 - slippageBps / 10_000),
  );
  const remaining = round2(envelope - parsed.notionalUsd);
  const inside = parsed.notionalUsd <= envelope;
  if (!inside) {
    return composeNeedsHuman(
      `${parsed.side} $${parsed.notionalUsd} of ETH`,
      `Notional $${parsed.notionalUsd} is outside the $${Math.round(envelope)} trade envelope from live pool depth.`,
    );
  }
  return spec(
    "confirm_spot_execution",
    "Confirmation preview from live pool depth. Execution is simulated.",
    [
      { type: "price_chart", pair: input.market.pair, range: "24h" },
      {
        type: "execution_preview",
        side: parsed.side,
        base: "ETH",
        quote: "USDC",
        notionalUsd: parsed.notionalUsd,
        expectedPriceUsd,
        slippageBps,
        poolTvlUsd: input.market.tvlUsd,
        remainingMandateUsd: remaining,
        verdict: "inside",
        reason:
          "Inside the signed envelope. Slippage is derived from Uniswap V3 TVL, not a fixed bps cap.",
      },
      {
        type: "amount_selector",
        id: "max_trade_usd",
        min: 0,
        max: Math.round(envelope),
        default: parsed.notionalUsd,
      },
      ...(input.risk
        ? [
            {
              type: "risk_summary" as const,
              risk: input.risk,
              receiptTxId: input.receiptTxId ?? "pending",
            },
          ]
        : []),
    ],
  );
}

function composeFutures(input: ComposeInput): UISpec {
  const envelope = input.risk?.maxTradeEnvelopeUsd ?? 100;
  return spec(
    "confirm_futures_execution",
    "Futures stay inside the same signed envelope. Leverage is off; a stop is mandatory. Simulated in this build.",
    [
      { type: "price_chart", pair: input.market.pair, range: "24h" },
      {
        type: "leverage_control",
        enabled: false,
        maxLeverage: 1,
        stopRequired: true,
        labeled: "simulated",
      },
      {
        type: "execution_preview",
        side: "buy",
        base: "ETH",
        quote: "USDC",
        notionalUsd: Math.min(100, envelope),
        expectedPriceUsd: input.market.priceUsd,
        slippageBps: 5,
        poolTvlUsd: input.market.tvlUsd,
        remainingMandateUsd: round2(envelope - Math.min(100, envelope)),
        verdict: "inside",
        reason:
          "Leverage disabled. A stop is required before any leveraged opening can be authorized.",
      },
      ...(input.risk
        ? [
            {
              type: "risk_summary" as const,
              risk: input.risk,
              receiptTxId: input.receiptTxId ?? "pending",
            },
          ]
        : []),
    ],
  );
}

function composeCompare(input: ComposeInput): UISpec {
  const { ethUsd, usdcUsd } = holdingsUsd(input.portfolio, input.market.priceUsd);
  const maxTrade = input.risk?.maxTradeEnvelopeUsd ?? Number.POSITIVE_INFINITY;
  const raw = enumerateCandidates({ ethUsd, usdcUsd, allowRebalance: true, maxTradeUsd: maxTrade });
  const candidates = filterFeasible(raw, {
    ethUsd,
    usdcUsd,
    allowRebalance: true,
    maxTradeUsd: maxTrade,
  })
    .filter((c) => c.distance === 0 || c.distance === 5 || c.distance === 10 || c.ethPct % 25 === 0)
    .slice(0, 6);
  const current = candidates.find((c) => c.distance === 0) ?? candidates[0];
  return spec(
    "compare_strategies",
    "Allocation alternatives from live holdings. Do-nothing is always present.",
    [
      { type: "price_chart", pair: input.market.pair, range: "24h" },
      {
        type: "strategy_comparison",
        currentEthPct: current?.ethPct ?? 50,
        currentUsdcPct: current?.usdcPct ?? 50,
        candidates: candidates.length ? candidates : raw.slice(0, 5),
      },
    ],
  );
}

export function uiIntentForTemplate(template: TaskTemplate): UISpecIntent {
  return intentForTemplate(template);
}
