import {
  MARKET_ASSETS,
  type MarketAsset,
  type MarketContext,
  type MarketPair,
} from "@custodia/schema";
import { toMarketAsset } from "./pools.js";
import { realizedVolPct } from "./vol.js";

const REQUIRED_HOURS = 24;
const STABLE_PRIORITY = ["USDC", "USDT", "DAI", "ETH"];

const hourBucket = (ts: number): number => Math.floor(ts / 3600) * 3600;

const byHour = (hourly: Array<{ ts: number; close: number }>): Map<number, number> => {
  const map = new Map<number, number>();
  for (const point of hourly) {
    if (!Number.isFinite(point.close) || point.close <= 0) continue;
    map.set(hourBucket(point.ts), point.close);
  }
  return map;
};

const quoteRank = (quote: string): number => {
  const index = STABLE_PRIORITY.indexOf(quote);
  return index < 0 ? STABLE_PRIORITY.length : index;
};

/** USD close series per asset, preferring a USD-stable-quoted venue when two exist. */
export const usdSeriesFromVenues = (
  venues: MarketContext[],
): Partial<Record<MarketAsset, Map<number, number>>> => {
  const ranked = [...venues].sort((a, b) => quoteRank(a.quote) - quoteRank(b.quote));
  const series: Partial<Record<MarketAsset, Map<number, number>>> = {};
  for (const venue of ranked) {
    const asset = toMarketAsset(venue.base) as MarketAsset;
    if (series[asset]) continue;
    series[asset] = byHour(venue.hourly);
  }
  const clock = series.ETH ?? ranked[0]?.hourly;
  const hours =
    clock instanceof Map ? [...clock.keys()] : (clock ?? []).map((point) => hourBucket(point.ts));
  for (const stable of ["USDC", "USDT"] as const) {
    if (!series[stable] && hours.length) {
      series[stable] = new Map(hours.map((ts) => [ts, 1]));
    }
  }
  return series;
};

const ratioHourly = (
  base: Map<number, number>,
  quote: Map<number, number>,
): Array<{ ts: number; close: number }> => {
  const hourly: Array<{ ts: number; close: number }> = [];
  for (const [ts, baseUsd] of [...base.entries()].sort((a, b) => a[0] - b[0])) {
    const quoteUsd = quote.get(ts);
    if (!quoteUsd || quoteUsd <= 0) continue;
    hourly.push({ ts, close: baseUsd / quoteUsd });
  }
  return hourly;
};

export const expandCrossPairs = (venues: MarketContext[]): MarketContext[] => {
  const usd = usdSeriesFromVenues(venues);
  const template = venues.find((row) => row.pair === "ETH/USDC") ?? venues[0];
  if (!template) return [];
  const out: MarketContext[] = [];
  for (const base of MARKET_ASSETS) {
    for (const quote of MARKET_ASSETS) {
      if (base === quote) continue;
      const baseUsd = usd[base];
      const quoteUsd = usd[quote];
      if (!baseUsd || !quoteUsd) continue;
      const hourly = ratioHourly(baseUsd, quoteUsd);
      if (hourly.length < REQUIRED_HOURS) continue;
      const lastUsd = [...baseUsd.values()].at(-1);
      const lastPair = hourly.at(-1)?.close;
      if (!lastUsd || !lastPair) continue;
      const pair = `${base}/${quote}` as MarketPair;
      const physical = venues.find(
        (row) => toMarketAsset(row.base) === base && toMarketAsset(row.quote) === quote,
      );
      out.push({
        pair,
        base,
        quote,
        poolId: physical?.poolId ?? `derived:${pair}`,
        poolName: physical?.poolName ?? `Derived ${pair} from USD legs`,
        priceUsd: lastUsd,
        realizedVol24hPct: realizedVolPct(
          hourly.slice(-REQUIRED_HOURS).map((point) => point.close),
        ),
        tvlUsd: physical?.tvlUsd ?? 0,
        hourly,
        block: template.block,
        fetchedAt: template.fetchedAt,
      });
    }
  }
  return out;
};
