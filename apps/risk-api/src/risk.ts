import type { MarketContext, RiskContext } from "@custodia/schema";

/**
 * Deterministic risk math. Every number is derived from the live MarketContext
 * (price/vol/TVL from the Uniswap V3 subgraph) and the request geometry — no
 * LLM anywhere in this service for v0. The client's bounds are clipped against
 * these values; a change in inputs always changes the output the same way.
 */
export interface RiskRequestInput {
  assets: string[];
  sizeUsd: number;
  allocationPct: number[];
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

export function computeRisk(market: MarketContext, input: RiskRequestInput): RiskContext {
  const volatility24hPct = round1(market.realizedVol24hPct);
  // Concentration: the largest single-asset share of the portfolio — a
  // 60/40 ETH/USDC split concentrates 60% in ETH.
  const concentrationPct = round1(Math.max(...input.allocationPct));
  // Trade envelope: never more than 2% of the pool's TVL, and never more than
  // the portfolio size — a trade this size moves the price materially.
  const maxTradeEnvelopeUsd = Math.min(input.sizeUsd, market.tvlUsd * 0.02);
  // 24 h drawdown band from realized volatility: roughly 0.5σ–2σ of daily
  // returns, in percent, clipped to a sane floor. Heuristic for v0 — the
  // formula is fixed so the UI sliders are stable between refreshes.
  const lo = round1(Math.max(0.1, volatility24hPct * 0.5));
  const hi = round1(volatility24hPct * 2);
  const drawdownRange: [number, number] = [lo, Math.max(lo + 0.1, hi)];

  return {
    volatility24hPct,
    concentrationPct,
    maxTradeEnvelopeUsd: Math.round(maxTradeEnvelopeUsd),
    drawdownRange,
    explanation:
      `ETH/USDC volatility ${volatility24hPct}% (24h realized, Uniswap V3 pool on The Graph); ` +
      `concentration ${concentrationPct}% in the largest asset; ` +
      `max trade envelope $${Math.round(maxTradeEnvelopeUsd).toLocaleString("en-US")} ` +
      `(2% of pool TVL $${Math.round(market.tvlUsd).toLocaleString("en-US")}); ` +
      `expected 24h drawdown band ${drawdownRange[0]}%–${drawdownRange[1]}% ` +
      `derived from realized volatility.`,
  };
}
