import { MARKET_ASSETS, type MarketPair } from "@custodia/schema";

export type PoolToken = { symbol: string; decimals: number };

export const VENUE_PAIRS = [
  "ETH/USDC",
  "ETH/USDT",
  "WBTC/USDC",
  "WBTC/ETH",
  "LINK/ETH",
  "UNI/ETH",
  "DAI/USDC",
  "USDC/USDT",
] as const;
export type VenuePair = (typeof VENUE_PAIRS)[number];

export type Venue = {
  pair: VenuePair;
  poolId: `0x${string}`;
  expectedName: string;
  base: string;
  quote: string;
};

/**
 * Confirmed live 2026-09-12 against the Messari Uniswap V3 Ethereum subgraph.
 * These physical pools seed USD series; every other pair is derived from those legs.
 */
export const VENUES: Record<VenuePair, Venue> = {
  "ETH/USDC": {
    pair: "ETH/USDC",
    poolId: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
    expectedName: "Uniswap V3 USD Coin/Wrapped Ether 0.05%",
    base: "ETH",
    quote: "USDC",
  },
  "ETH/USDT": {
    pair: "ETH/USDT",
    poolId: "0x11b815efb8f581194ae79006d24e0d814b7697f6",
    expectedName: "Uniswap V3 Wrapped Ether/Tether USD 0.05%",
    base: "ETH",
    quote: "USDT",
  },
  "WBTC/USDC": {
    pair: "WBTC/USDC",
    poolId: "0x99ac8ca7087fa4a2a1fb6357269965a2014abc35",
    expectedName: "Uniswap V3 Wrapped BTC/USD Coin 0.3%",
    base: "WBTC",
    quote: "USDC",
  },
  "WBTC/ETH": {
    pair: "WBTC/ETH",
    poolId: "0x4585fe77225b41b697c938b018e2ac67ac5a20c0",
    expectedName: "Uniswap V3 Wrapped BTC/Wrapped Ether 0.05%",
    base: "WBTC",
    quote: "ETH",
  },
  "LINK/ETH": {
    pair: "LINK/ETH",
    poolId: "0xa6cc3c2531fdaa6ae1a3ca84c2855806728693e8",
    expectedName: "Uniswap V3 ChainLink Token/Wrapped Ether 0.3%",
    base: "LINK",
    quote: "ETH",
  },
  "UNI/ETH": {
    pair: "UNI/ETH",
    poolId: "0x1d42064fc4beb5f8aaf85f4617ae8b3b5b8bd801",
    expectedName: "Uniswap V3 Uniswap/Wrapped Ether 0.3%",
    base: "UNI",
    quote: "ETH",
  },
  "DAI/USDC": {
    pair: "DAI/USDC",
    poolId: "0x5777d92f208679db4b9778590fa3cab3ac9e2168",
    expectedName: "Uniswap V3 Dai Stablecoin/USD Coin 0.01%",
    base: "DAI",
    quote: "USDC",
  },
  "USDC/USDT": {
    pair: "USDC/USDT",
    poolId: "0x3416cf6c708da44db2624d63ea0aaef7113527c6",
    expectedName: "Uniswap V3 USD Coin/Tether USD 0.01%",
    base: "USDC",
    quote: "USDT",
  },
};

export const MARKET_PAIR_LIST: MarketPair[] = MARKET_ASSETS.flatMap((base) =>
  MARKET_ASSETS.filter((quote) => quote !== base).map((quote) => `${base}/${quote}` as MarketPair),
);

export const UNISWAP_V3_POOL_USDC_WETH_005 = VENUES["ETH/USDC"].poolId;
export const UNISWAP_V3_POOL_EXPECTED_NAME = VENUES["ETH/USDC"].expectedName;

const USD_STABLES = new Set(["USDC", "USDT", "DAI"]);

const CANONICAL: Record<string, string> = {
  ETH: "WETH",
  WETH: "WETH",
  BTC: "WBTC",
  WBTC: "WBTC",
};

export const canonicalSymbol = (symbol: string): string => CANONICAL[symbol] ?? symbol;

export const toMarketAsset = (symbol: string): string => {
  if (symbol === "WBTC" || symbol === "BTC") return "BTC";
  if (symbol === "WETH") return "ETH";
  return symbol;
};

export const tokenMatches = (tokenSymbol: string, wanted: string): boolean =>
  tokenSymbol === wanted || canonicalSymbol(tokenSymbol) === canonicalSymbol(wanted);

export const isUsdStable = (symbol: string): boolean => USD_STABLES.has(symbol);

/** Human-unit amount of token1 per 1 token0. */
export const tickToToken1PerToken0 = (tick: number, decimals0: number, decimals1: number): number =>
  1.0001 ** tick * 10 ** (decimals0 - decimals1);

export const quotePerBase = (
  tick: number,
  tokens: PoolToken[],
  base: string,
  quote: string,
): number => {
  if (tokens.length < 2) throw new Error("pool must have two legs");
  const token0 = tokens[0];
  const token1 = tokens[1];
  if (!token0 || !token1) throw new Error("pool must have two legs");
  const baseIndex = tokens.findIndex((token) => tokenMatches(token.symbol, base));
  const quoteIndex = tokens.findIndex((token) => tokenMatches(token.symbol, quote));
  if (baseIndex < 0 || quoteIndex < 0) {
    throw new Error(
      `pool legs are ${tokens.map((token) => token.symbol).join("/")}, expected ${base}/${quote}`,
    );
  }
  const token1PerToken0 = tickToToken1PerToken0(tick, token0.decimals, token1.decimals);
  if (!Number.isFinite(token1PerToken0) || token1PerToken0 <= 0) {
    throw new Error(`tick ${tick} produced a non-finite price`);
  }
  return baseIndex === 0 ? token1PerToken0 : 1 / token1PerToken0;
};

export const priceUsdFromQuote = (
  quotePerBaseValue: number,
  quote: string,
  ethUsd: number | undefined,
): number => {
  if (isUsdStable(quote)) return quotePerBaseValue;
  if (canonicalSymbol(quote) === "WETH") {
    if (!ethUsd || ethUsd <= 0) throw new Error("ETH/USDC price required to USD-quote this pool");
    return quotePerBaseValue * ethUsd;
  }
  throw new Error(`quote ${quote} is not a USD stable or ETH`);
};

export const venueFor = (pair: string): Venue => {
  const venue = VENUES[pair as VenuePair];
  if (!venue) {
    throw new Error(`no physical Uniswap V3 venue for ${pair}; derive it from USD legs`);
  }
  return venue;
};
