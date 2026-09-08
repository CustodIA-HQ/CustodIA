import { type MarketContext, MarketContextSchema } from "@custodia/schema";
import { gql, request } from "graphql-request";
import { z } from "zod";
import type { MarketCache } from "./cache.js";
import { graphEndpoint } from "./config.js";
import { realizedVolPct } from "./vol.js";

/**
 * Subgraph IDs verified live on 2026-09-08 (see QUICKREF.md). Messari's repo
 * is 17 months stale — every ID is checked with {_meta{block{number}}} by
 * `pnpm verify:graph` before it is trusted.
 */
export const UNISWAP_V3_ETH_SUBGRAPH_ID = "4cKy6QQMc5tpfdx8yxfYeb9TLZmgLQe44ddW1G7NwkA6";
export const AAVE_V3_ETH_SUBGRAPH_ID = "JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk";
export const AGENT0_SEPOLIA_SUBGRAPH_ID = "6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT";

/**
 * Canonical USDC/WETH 0.05% pool on Ethereum mainnet. The fee tier of the
 * dominant ETH/USDC pool ("low" = 0.05%) — the pair we quote.
 *
 * CONFIRMED against the subgraph on 2026-09-08 via
 * `pools(where:{token0:USDC, token1:WETH, feeTier:500})` (see verify-graph):
 * the query returns exactly this pool as `id`.
 */
export const UNISWAP_V3_POOL_USDC_WETH_005 = "0x8ad599c3a0ff1de082011efddc58f1908eb6e6d8";

// USDC and WETH token addresses on Ethereum mainnet, used for the pool lookup.
export const USDC_ETH_MAINNET = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
export const WETH_ETH_MAINNET = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

const MARKET_QUERY = gql`
  query Market($poolId: ID!) {
    _meta {
      block { number }
    }
    pool(id: $poolId) {
      token0Price
      totalValueLockedUSD
      poolHourData(first: 24, orderBy: periodStartUnix, orderDirection: desc) {
        periodStartUnix
        close
      }
    }
  }
`;

// The Graph returns numeric subgraph fields as strings; the zod layer below is
// the only place raw responses may cross from the wire into the domain.
const PoolResponseSchema = z
  .object({
    _meta: z.object({ block: z.object({ number: z.number().int() }) }),
    pool: z
      .object({
        token0Price: z.string(),
        totalValueLockedUSD: z.string(),
        poolHourData: z.array(z.object({ periodStartUnix: z.number().int(), close: z.string() })),
      })
      .nullable(),
  })
  .strict();

const parseFloatOrThrow = (raw: string, field: string): number => {
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Graph returned a non-numeric ${field}: "${raw}"`);
  }
  return value;
};

interface InMemoryEntry {
  at: number;
  ttlS: number;
  value: MarketContext;
}

const memoryStore = new Map<string, InMemoryEntry>();

/** Default cache used when callers do not inject one (e.g. the verify script). */
const memoryCache: MarketCache = {
  async get(key) {
    const entry = memoryStore.get(key);
    if (!entry) return null;
    return entry.at + 30_000 > Date.now() ? entry.value : null;
  },
  async set(key, value, ttlS) {
    memoryStore.set(key, { at: Date.now(), value: value as MarketContext, ttlS });
  },
};

export interface GetMarketContextOptions {
  cache?: MarketCache;
  ttlS?: number;
}

export async function getMarketContext(
  pair: "ETH/USDC",
  options: GetMarketContextOptions = {},
): Promise<MarketContext> {
  const cache = options.cache ?? memoryCache;
  const ttlS = options.ttlS ?? 30;

  const cached = (await cache.get(pair)) as MarketContext | null;
  const fresh = cached && cached.fetchedAt + ttlS * 1000 > Date.now() ? cached : null;
  if (fresh) return fresh;

  const url = graphEndpoint(UNISWAP_V3_ETH_SUBGRAPH_ID);
  const raw = await request(url, MARKET_QUERY, { poolId: UNISWAP_V3_POOL_USDC_WETH_005 });
  const parsed = PoolResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Uniswap V3 subgraph response failed validation: ${parsed.error.message}`);
  }
  const { pool, _meta } = parsed.data;
  if (!pool) {
    throw new Error(`Uniswap V3 subgraph returned no pool for ${UNISWAP_V3_POOL_USDC_WETH_005}`);
  }

  // token0 is USDC, token1 is WETH → token0Price = USDC per WETH = ETH price.
  const priceUsd = parseFloatOrThrow(pool.token0Price, "token0Price");
  const tvlUsd = parseFloatOrThrow(pool.totalValueLockedUSD, "totalValueLockedUSD");
  const sorted = [...pool.poolHourData] // newest → oldest on the wire
    .sort((a, b) => a.periodStartUnix - b.periodStartUnix); // oldest → newest
  const hourly = sorted.map((h) => ({
    ts: h.periodStartUnix,
    close: parseFloatOrThrow(h.close, "close"),
  }));
  const closes = hourly.map((h) => h.close);

  const market: MarketContext = {
    pair,
    priceUsd,
    realizedVol24hPct: realizedVolPct(closes),
    tvlUsd,
    hourly,
    block: _meta.block.number,
    fetchedAt: Date.now(),
  };

  // Validate the assembled context before caching — the cache must never
  // poison the risk engine with a malformed payload.
  const checked = MarketContextSchema.parse(market);
  await cache.set(pair, checked, ttlS);
  return checked;
}

/** Confirm the canonical pool address against the live subgraph (verify-graph). */
export async function confirmPoolId(): Promise<{ advertised: string; found: string[] }> {
  const url = graphEndpoint(UNISWAP_V3_ETH_SUBGRAPH_ID);
  const query = gql`
    query PoolLookup {
      pools(where: { token0: $token0, token1: $token1, feeTier: 500 }) {
        id
      }
    }
  `;
  const raw = await request(url, query, {
    token0: USDC_ETH_MAINNET,
    token1: WETH_ETH_MAINNET,
  });
  const parsed = z.object({ pools: z.array(z.object({ id: z.string() })) }).parse(raw);
  return { advertised: UNISWAP_V3_POOL_USDC_WETH_005, found: parsed.pools.map((p) => p.id) };
}

export type { MarketCache } from "./cache.js";
export { MARKET_CACHE_TTL_S } from "./cache.js";
export { graphEndpoint } from "./config.js";
