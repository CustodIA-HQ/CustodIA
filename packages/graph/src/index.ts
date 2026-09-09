import { type MarketContext, MarketContextSchema } from "@custodia/schema";
import { gql, request } from "graphql-request";
import { z } from "zod";
import type { MarketCache } from "./cache.js";
import { graphEndpoint } from "./config.js";
import { realizedVolPct } from "./vol.js";

/**
 * Subgraph IDs from QUICKREF.md. These are the *Messari standardized* DEX
 * subgraphs (schema: liquidityPools / liquidityPoolHourlySnapshots / token),
 * NOT Uniswap's native schema (pools / poolHourData). Messari's repo is stale —
 * every ID is checked with {_meta{block{number}}} by `pnpm verify:graph`.
 */
export const UNISWAP_V3_ETH_SUBGRAPH_ID = "4cKy6QQMc5tpfdx8yxfYeb9TLZmgLQe44ddW1G7NwkA6";
export const AAVE_V3_ETH_SUBGRAPH_ID = "JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk";
export const AGENT0_SEPOLIA_SUBGRAPH_ID = "6wQRC7geo9XYAhckfmfo8kbMRLeWU8KQd3XsJqFKmZLT";

/**
 * Canonical USDC/WETH 0.05% pool on Ethereum mainnet — the deepest ETH/USDC
 * venue on Uniswap V3.
 *
 * CONFIRMED LIVE 2026-09-09 against the subgraph: `liquidityPool(id)` returns
 * name "Uniswap V3 USD Coin/Wrapped Ether 0.05%", inputTokens [USDC, WETH],
 * TVL ≈ $109M, hourly snapshots < 1 h old. `pnpm verify:graph` re-checks the
 * name on every run (`confirmPoolId`).
 */
export const UNISWAP_V3_POOL_USDC_WETH_005 = "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640";
export const UNISWAP_V3_POOL_EXPECTED_NAME = "Uniswap V3 USD Coin/Wrapped Ether 0.05%";

/** Hours of snapshots requested; a few extra guard against a missing hour. */
const SNAPSHOT_HOURS = 30;
const REQUIRED_HOURS = 24;

// Messari hourly snapshots carry no close price, but they do carry the pool's
// `tick` at snapshot time — the exact end-of-hour price from pool state.
// (hourlyVolumeByTokenUSD / Amount was tried first: its USD pricing has bad
// hours — $1,352 next to $2,490 — that inflated realized vol ~35×.)
const MARKET_QUERY = gql`
  query Market($poolId: ID!, $hours: Int!) {
    _meta {
      block { number }
    }
    liquidityPool(id: $poolId) {
      name
      tick
      totalValueLockedUSD
      inputTokens { symbol decimals }
    }
    liquidityPoolHourlySnapshots(
      first: $hours
      orderBy: timestamp
      orderDirection: desc
      where: { pool: $poolId }
    ) {
      timestamp
      tick
    }
  }
`;

// The Graph returns numeric subgraph fields as strings; the zod layer below is
// the only place raw responses may cross from the wire into the domain.
const MarketResponseSchema = z
  .object({
    _meta: z.object({ block: z.object({ number: z.number().int() }) }),
    liquidityPool: z
      .object({
        name: z.string(),
        tick: z.string().nullable(),
        totalValueLockedUSD: z.string(),
        inputTokens: z.array(z.object({ symbol: z.string(), decimals: z.number().int() })),
      })
      .nullable(),
    liquidityPoolHourlySnapshots: z.array(
      z.object({ timestamp: z.string(), tick: z.string().nullable() }),
    ),
  })
  .strict();

const parseFloatOrThrow = (raw: string, field: string): number => {
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Graph returned a non-numeric ${field}: "${raw}"`);
  }
  return value;
};

/**
 * Uniswap V3: 1.0001^tick is token1-per-token0 in raw units. Convert to the
 * human price of WETH in USDC, whichever leg WETH sits on.
 */
const tickToEthPriceUsd = (
  tick: number,
  legs: { usdcIndex: number; usdcDecimals: number; wethDecimals: number },
): number => {
  const raw1per0 = 1.0001 ** tick;
  const scale = 10 ** (legs.wethDecimals - legs.usdcDecimals);
  // WETH is token1 → USDC per WETH = scale / raw ; WETH is token0 → raw / scale⁻¹
  return legs.usdcIndex === 0 ? scale / raw1per0 : raw1per0 * scale;
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
  const raw = await request(url, MARKET_QUERY, {
    poolId: UNISWAP_V3_POOL_USDC_WETH_005,
    hours: SNAPSHOT_HOURS,
  });
  const parsed = MarketResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Uniswap V3 subgraph response failed validation: ${parsed.error.message}`);
  }
  const { _meta, liquidityPool: pool, liquidityPoolHourlySnapshots: snapshots } = parsed.data;
  if (!pool) throw new Error(`subgraph returned no pool for ${UNISWAP_V3_POOL_USDC_WETH_005}`);
  if (pool.name !== UNISWAP_V3_POOL_EXPECTED_NAME) {
    throw new Error(
      `pool ${UNISWAP_V3_POOL_USDC_WETH_005} is "${pool.name}", expected "${UNISWAP_V3_POOL_EXPECTED_NAME}"`,
    );
  }
  if (pool.tick === null) throw new Error("pool has no current tick");

  const usdcIndex = pool.inputTokens.findIndex((t) => t.symbol === "USDC");
  const usdc = pool.inputTokens[usdcIndex];
  const weth = pool.inputTokens.find((t) => t.symbol === "WETH");
  if (!usdc || !weth) {
    throw new Error(
      `pool legs are ${pool.inputTokens.map((t) => t.symbol).join("/")}, expected USDC/WETH`,
    );
  }
  const legs = { usdcIndex, usdcDecimals: usdc.decimals, wethDecimals: weth.decimals };

  const priceUsd = tickToEthPriceUsd(Number.parseInt(pool.tick, 10), legs);
  const tvlUsd = parseFloatOrThrow(pool.totalValueLockedUSD, "totalValueLockedUSD");

  // Newest → oldest on the wire; build oldest → newest closes from each hour's tick.
  const hourly = [...snapshots]
    .reverse()
    .flatMap((s) =>
      s.tick === null
        ? []
        : [
            {
              ts: Number.parseInt(s.timestamp, 10),
              close: tickToEthPriceUsd(Number.parseInt(s.tick, 10), legs),
            },
          ],
    )
    .slice(-REQUIRED_HOURS);
  if (hourly.length < REQUIRED_HOURS) {
    throw new Error(`only ${hourly.length} hourly snapshots with a tick; need ${REQUIRED_HOURS}`);
  }

  const market: MarketContext = {
    pair,
    priceUsd,
    realizedVol24hPct: realizedVolPct(hourly.map((h) => h.close)),
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

/** Confirm the canonical pool against the live subgraph by name (verify-graph). */
export async function confirmPoolId(): Promise<{
  advertised: string;
  name: string | null;
  ok: boolean;
}> {
  const url = graphEndpoint(UNISWAP_V3_ETH_SUBGRAPH_ID);
  const query = gql`
    query PoolLookup($poolId: ID!) {
      liquidityPool(id: $poolId) { name }
    }
  `;
  const raw = await request(url, query, { poolId: UNISWAP_V3_POOL_USDC_WETH_005 });
  const parsed = z.object({ liquidityPool: z.object({ name: z.string() }).nullable() }).parse(raw);
  const name = parsed.liquidityPool?.name ?? null;
  return {
    advertised: UNISWAP_V3_POOL_USDC_WETH_005,
    name,
    ok: name === UNISWAP_V3_POOL_EXPECTED_NAME,
  };
}

export type { MarketCache } from "./cache.js";
export { MARKET_CACHE_TTL_S } from "./cache.js";
export { graphEndpoint } from "./config.js";
