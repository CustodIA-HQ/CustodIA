import { expect, it } from "vitest";
import {
  priceUsdFromQuote,
  quotePerBase,
  tickToToken1PerToken0,
  tokenMatches,
  venueFor,
} from "./pools.js";

it("maps Uniswap V3 tick 0 with equal decimals to 1", () => {
  expect(tickToToken1PerToken0(0, 6, 6)).toBeCloseTo(1);
  expect(
    quotePerBase(
      0,
      [
        { symbol: "USDC", decimals: 6 },
        { symbol: "USDT", decimals: 6 },
      ],
      "USDC",
      "USDT",
    ),
  ).toBeCloseTo(1);
});

it("prices WETH in USDC when USDC is token0", () => {
  const tokens = [
    { symbol: "USDC", decimals: 6 },
    { symbol: "WETH", decimals: 18 },
  ];
  const usdcPerEth = quotePerBase(0, tokens, "ETH", "USDC");
  expect(usdcPerEth).toBeCloseTo(1e12);
  expect(tokenMatches("WETH", "ETH")).toBe(true);
});

it("prices WETH in USDT when WETH is token0", () => {
  const tokens = [
    { symbol: "WETH", decimals: 18 },
    { symbol: "USDT", decimals: 6 },
  ];
  const usdtPerEth = quotePerBase(0, tokens, "ETH", "USDT");
  expect(usdtPerEth).toBeCloseTo(1e12);
});

it("converts an ETH-quoted price with the ETH/USDC spot", () => {
  expect(priceUsdFromQuote(25, "ETH", 2500)).toBeCloseTo(62_500);
  expect(priceUsdFromQuote(2500, "USDC", undefined)).toBeCloseTo(2500);
  expect(() => priceUsdFromQuote(25, "ETH", undefined)).toThrow(/ETH\/USDC/);
});

it("looks up confirmed venues and rejects unknown pairs", () => {
  expect(venueFor("ETH/USDC").poolId).toMatch(/^0x88e6/);
  expect(venueFor("WBTC/USDC").expectedName).toMatch(/Wrapped BTC/);
  expect(() => venueFor("PEPE/USDC")).toThrow(/no physical Uniswap V3 venue/);
});
