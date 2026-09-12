import type { MarketContext } from "@custodia/schema";
import { expect, it } from "vitest";
import { expandCrossPairs } from "./cross.js";

const hourly = (spot: number, start = 1_700_000_000): Array<{ ts: number; close: number }> =>
  Array.from({ length: 30 }, (_, index) => ({ ts: start + index * 3600, close: spot }));

const venue = (
  pair: MarketContext["pair"],
  base: string,
  quote: string,
  spot: number,
): MarketContext => ({
  pair,
  base,
  quote,
  poolId: `0x${base}${quote}`.slice(0, 42).padEnd(42, "0"),
  poolName: `${base}/${quote} pool`,
  priceUsd: spot,
  realizedVol24hPct: 1,
  tvlUsd: 1_000,
  hourly: hourly(spot),
  block: 1,
  fetchedAt: 1,
});

it("derives ETH/BTC from ETH and BTC USD legs and keeps ETH/USDC", () => {
  const markets = expandCrossPairs([
    venue("ETH/USDC", "ETH", "USDC", 2500),
    venue("BTC/USDC", "BTC", "USDC", 50_000),
  ]);
  const pairs = markets.map((row) => row.pair);
  expect(pairs).toContain("ETH/USDC");
  expect(pairs).toContain("ETH/BTC");
  expect(pairs).toContain("BTC/ETH");
  expect(pairs).toContain("BTC/USDC");
  const ethBtc = markets.find((row) => row.pair === "ETH/BTC");
  expect(ethBtc?.hourly.at(-1)?.close).toBeCloseTo(0.05);
  expect(ethBtc?.priceUsd).toBeCloseTo(2500);
  expect(ethBtc?.poolId).toMatch(/^derived:/);
  const btcEth = markets.find((row) => row.pair === "BTC/ETH");
  expect(btcEth?.hourly.at(-1)?.close).toBeCloseTo(20);
  const ethUsdc = markets.find((row) => row.pair === "ETH/USDC");
  expect(ethUsdc?.hourly.at(-1)?.close).toBeCloseTo(2500);
  expect(ethUsdc?.poolName).toMatch(/pool/);
});

it("does not emit a pair against itself", () => {
  const markets = expandCrossPairs([venue("ETH/USDC", "ETH", "USDC", 2500)]);
  expect(markets.some((row) => row.base === row.quote)).toBe(false);
  expect(markets.map((row) => row.pair)).toContain("ETH/USDC");
  expect(markets.map((row) => row.pair)).toContain("USDC/ETH");
});
