import { composeNeedsHuman, composeUISpec } from "@custodia/agent/compose";
import { VENUES } from "@custodia/graph/pools";
import type {
  Intent,
  MarketAsset,
  MarketContext,
  MarketPair,
  RiskContext,
  TaskTemplate,
  UISpec,
} from "@custodia/schema";

const ASSET_USD: Record<MarketAsset, number> = {
  ETH: 2500,
  BTC: 64_000,
  LINK: 15,
  UNI: 8,
  DAI: 1,
  USDC: 1,
  USDT: 1,
};

const sampleHourly = (spot: number, wobble: boolean) =>
  Array.from({ length: 180 }, (_, index) => ({
    ts: 1_780_000_000 + index * 3600,
    close: wobble ? spot * (1 + Math.sin(index / 8) * 0.036 + Math.sin(index / 40) * 0.016) : spot,
  }));

const splitPair = (pair: MarketPair): { base: MarketAsset; quote: MarketAsset } => {
  const [base, quote] = pair.split("/") as [MarketAsset, MarketAsset];
  return { base, quote };
};

export const labMarket = (volPct = 6, pair: MarketPair = "ETH/USDC"): MarketContext => {
  const { base, quote } = splitPair(pair);
  const baseUsd = sampleHourly(ASSET_USD[base], !["USDC", "USDT", "DAI"].includes(base));
  const quoteUsd = sampleHourly(ASSET_USD[quote], !["USDC", "USDT", "DAI"].includes(quote));
  const hourly = baseUsd.map((point, index) => ({
    ts: point.ts,
    close: point.close / (quoteUsd[index]?.close || 1),
  }));
  const venue = Object.values(VENUES).find(
    (row) =>
      (row.base === base || (base === "BTC" && row.base === "WBTC")) &&
      (row.quote === quote || (quote === "BTC" && row.quote === "WBTC")),
  );
  return {
    pair,
    base,
    quote,
    poolId: venue?.poolId ?? `derived:${pair}`,
    poolName: venue?.expectedName ?? `Derived ${pair} from USD legs`,
    priceUsd: baseUsd.at(-1)?.close ?? ASSET_USD[base],
    realizedVol24hPct: volPct,
    tvlUsd: venue ? 109_430_501 : 0,
    hourly,
    block: 9_000_000,
    fetchedAt: 1_780_000_000,
  };
};

export const demoMarket: MarketContext = labMarket(6, "ETH/USDC");

export const demoRisk: RiskContext = {
  volatility24hPct: 6,
  concentrationPct: 62,
  maxTradeEnvelopeUsd: 2500,
  drawdownRange: [3, 12],
  explanation:
    "ETH/USDC volatility 6% (24h realized, Uniswap V3 pool on The Graph); concentration 62% in ETH; max trade envelope $400.",
};

const intentFor: Record<TaskTemplate, Intent> = {
  portfolio_guard: "guard",
  position_protection: "protect",
  collateral_guard: "collateral",
  spot_execution: "execute",
  futures_execution: "futures",
  strategy_compare: "evaluate",
  needs_human: "execute",
};

export type LabCase = TaskTemplate | "research";

export type LabKnobs = {
  case: LabCase;
  volPct: number;
  envelopeUsd: number;
  notionalUsd: number;
  deductiblePct: number;
  eth: string;
  usdc: string;
  market?: MarketContext;
};

export const demoSpec = (template: TaskTemplate, knobs?: Partial<LabKnobs>): UISpec => {
  const volPct = knobs?.volPct ?? demoRisk.volatility24hPct;
  const envelopeUsd = knobs?.envelopeUsd ?? demoRisk.maxTradeEnvelopeUsd;
  const market: MarketContext = {
    ...(knobs?.market ?? demoMarket),
    realizedVol24hPct: knobs?.market?.realizedVol24hPct ?? volPct,
  };
  const base = market.base;
  const risk: RiskContext = {
    ...demoRisk,
    volatility24hPct: volPct,
    drawdownRange: [Math.max(1, Math.round(volPct * 0.5)), Math.max(3, Math.round(volPct * 2))],
    maxTradeEnvelopeUsd: envelopeUsd,
    explanation: `Mock risk: realized vol ${volPct}%, envelope $${envelopeUsd}, pair ${market.pair}.`,
  };
  const portfolio = { eth: knobs?.eth ?? "2.4", usdc: knobs?.usdc ?? "1800" };
  if (template === "needs_human") {
    return composeNeedsHuman(
      `buy $${knobs?.notionalUsd ?? 50_000} of ${base}`,
      `Notional $${knobs?.notionalUsd ?? 50_000} is outside the $${envelopeUsd} trade envelope from live pool depth.`,
    );
  }
  const message =
    template === "spot_execution"
      ? `Buy ${knobs?.notionalUsd ?? 500} USDC of ${base}`
      : template === "position_protection"
        ? `Protect me if ${base} drops more than ${knobs?.deductiblePct ?? 15}%`
        : template === "portfolio_guard"
          ? `Keep ${market.pair} inside a 5% drawdown`
          : template === "futures_execution"
            ? `Open a small ${base} future`
            : template === "strategy_compare"
              ? `Compare ${base} and USDC allocations`
              : `Buy 50000 USDC of ${base}`;
  const spec = composeUISpec({
    intent: intentFor[template],
    market,
    risk,
    portfolio,
    message,
    receiptTxId: "demo",
  });
  if (!spec) throw new Error(`No demo spec for ${template}`);
  return spec;
};
