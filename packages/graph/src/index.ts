import {
  type MarketContext,
  MarketContextSchema,
  type MarketPair,
  MarketPairSchema,
} from "@custodia/schema";
import { GraphQLClient, gql, request } from "graphql-request";
import { z } from "zod";
import type { MarketCache } from "./cache.js";
import { graphEndpoint } from "./config.js";
import { expandCrossPairs } from "./cross.js";
import {
  MARKET_PAIR_LIST,
  priceUsdFromQuote,
  quotePerBase,
  toMarketAsset,
  UNISWAP_V3_POOL_EXPECTED_NAME,
  UNISWAP_V3_POOL_USDC_WETH_005,
  VENUE_PAIRS,
  venueFor,
} from "./pools.js";
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
export { UNISWAP_V3_POOL_EXPECTED_NAME, UNISWAP_V3_POOL_USDC_WETH_005 };

/** Seven days of hourly snapshots plus a few extra to guard against a gap. */
const CHART_HOURS = 7 * 24;
const SNAPSHOT_HOURS = CHART_HOURS + 12;
const REQUIRED_HOURS = 24;
const GRAPH_REQUEST_TIMEOUT_MS = 15_000;
const GRAPH_RETRY_DELAY_MS = 250;
const FALLBACK_SNAPSHOT_HOURS = 48;

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

const requestMarket = async (url: string, variables: { poolId: string; hours: number }) => {
  let lastError: unknown;
  const queries = [variables.hours, FALLBACK_SNAPSHOT_HOURS];
  for (const hours of queries) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), GRAPH_REQUEST_TIMEOUT_MS);
      try {
        const client = new GraphQLClient(url, {
          fetch: (input, init) => fetch(input, { ...init, signal: controller.signal }),
        });
        return await client.request(MARKET_QUERY, { ...variables, hours });
      } catch (error) {
        lastError = error;
        if (attempt === 0)
          await new Promise((resolve) => setTimeout(resolve, GRAPH_RETRY_DELAY_MS));
      } finally {
        clearTimeout(timeout);
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("The Graph market request failed");
};

export interface GetMarketContextOptions {
  cache?: MarketCache;
  ttlS?: number;
  /** ETH/USDC spot used to USD-quote ETH-quoted venues; fetched if omitted. */
  ethUsd?: number;
}

const readCachedMarket = async (
  cache: MarketCache,
  pair: MarketPair,
  ttlS: number,
): Promise<MarketContext | null> => {
  const cached = await cache.get(pair);
  const parsed = MarketContextSchema.safeParse(cached);
  if (!parsed.success) return null;
  return parsed.data.fetchedAt + ttlS * 1000 > Date.now() ? parsed.data : null;
};

const closeUsd = (
  tick: number,
  tokens: Array<{ symbol: string; decimals: number }>,
  venue: ReturnType<typeof venueFor>,
  ethUsd: number | undefined,
): number =>
  priceUsdFromQuote(quotePerBase(tick, tokens, venue.base, venue.quote), venue.quote, ethUsd);

const fetchVenue = async (
  venuePair: (typeof VENUE_PAIRS)[number],
  options: GetMarketContextOptions,
  ethUsd: number | undefined,
): Promise<MarketContext> => {
  const venue = venueFor(venuePair);
  const cache = options.cache ?? memoryCache;
  const ttlS = options.ttlS ?? 30;
  const publicPair = `${toMarketAsset(venue.base)}/${toMarketAsset(venue.quote)}` as MarketPair;
  const fresh = await readCachedMarket(cache, publicPair, ttlS);
  if (fresh && fresh.poolId === venue.poolId) return fresh;

  let resolvedEthUsd = ethUsd;
  if (venue.quote === "ETH" && (resolvedEthUsd === undefined || resolvedEthUsd <= 0)) {
    const eth = await fetchVenue("ETH/USDC", options, undefined);
    resolvedEthUsd = eth.priceUsd;
  }

  const url = graphEndpoint(UNISWAP_V3_ETH_SUBGRAPH_ID);
  const raw = await requestMarket(url, {
    poolId: venue.poolId,
    hours: SNAPSHOT_HOURS,
  });
  const parsed = MarketResponseSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Uniswap V3 subgraph response failed validation: ${parsed.error.message}`);
  }
  const { _meta, liquidityPool: pool, liquidityPoolHourlySnapshots: snapshots } = parsed.data;
  if (!pool) throw new Error(`subgraph returned no pool for ${venue.poolId}`);
  if (pool.name !== venue.expectedName) {
    throw new Error(`pool ${venue.poolId} is "${pool.name}", expected "${venue.expectedName}"`);
  }
  if (pool.tick === null) throw new Error(`pool ${venue.pair} has no current tick`);

  const tokens = pool.inputTokens;
  const priceUsd = closeUsd(Number.parseInt(pool.tick, 10), tokens, venue, resolvedEthUsd);
  const tvlUsd = parseFloatOrThrow(pool.totalValueLockedUSD, "totalValueLockedUSD");

  // Newest → oldest on the wire; build oldest → newest closes from each hour's tick.
  const hourly = [...snapshots]
    .reverse()
    .flatMap((snapshot) =>
      snapshot.tick === null
        ? []
        : [
            {
              ts: Number.parseInt(snapshot.timestamp, 10),
              close: closeUsd(Number.parseInt(snapshot.tick, 10), tokens, venue, resolvedEthUsd),
            },
          ],
    )
    .slice(-CHART_HOURS);
  if (hourly.length < REQUIRED_HOURS) {
    throw new Error(`only ${hourly.length} hourly snapshots with a tick; need ${REQUIRED_HOURS}`);
  }

  const market: MarketContext = {
    pair: publicPair,
    base: toMarketAsset(venue.base),
    quote: toMarketAsset(venue.quote),
    poolId: venue.poolId,
    poolName: pool.name,
    priceUsd,
    realizedVol24hPct: realizedVolPct(hourly.slice(-REQUIRED_HOURS).map((h) => h.close)),
    tvlUsd,
    hourly,
    block: _meta.block.number,
    fetchedAt: Date.now(),
  };

  const checked = MarketContextSchema.parse(market);
  await cache.set(publicPair, checked, ttlS);
  return checked;
};

const getVenueMarkets = async (options: GetMarketContextOptions = {}): Promise<MarketContext[]> => {
  const eth = await fetchVenue("ETH/USDC", options, undefined);
  const rest = await Promise.allSettled(
    VENUE_PAIRS.filter((pair) => pair !== "ETH/USDC").map((pair) =>
      fetchVenue(pair, { ...options, ethUsd: eth.priceUsd }, eth.priceUsd),
    ),
  );
  return [eth, ...rest.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))];
};

export async function getMarketContext(
  pair: MarketPair | string = "ETH/USDC",
  options: GetMarketContextOptions = {},
): Promise<MarketContext> {
  const parsedPair = MarketPairSchema.parse(
    String(pair).replaceAll("WBTC", "BTC").replaceAll("WETH", "ETH"),
  );
  const cache = options.cache ?? memoryCache;
  const ttlS = options.ttlS ?? 30;
  const fresh = await readCachedMarket(cache, parsedPair, ttlS);
  if (fresh) return fresh;
  const derived = expandCrossPairs(await getVenueMarkets(options)).find(
    (row) => row.pair === parsedPair,
  );
  if (!derived) {
    throw new Error(
      `no USD legs to derive ${parsedPair}; compatible: ${MARKET_PAIR_LIST.join(", ")}`,
    );
  }
  const checked = MarketContextSchema.parse(derived);
  await cache.set(parsedPair, checked, ttlS);
  return checked;
}

/** Physical venues plus every derived cross pair (ETH/BTC, LINK/USDC, …). */
export async function getMarketContexts(
  options: GetMarketContextOptions = {},
): Promise<MarketContext[]> {
  return expandCrossPairs(await getVenueMarkets(options));
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

export { aaveHandler, getAaveCollateral } from "./aave.js";
export type { MarketCache } from "./cache.js";
export { MARKET_CACHE_TTL_S } from "./cache.js";
export { graphEndpoint } from "./config.js";
export { MARKET_PAIR_LIST, VENUES, venueFor } from "./pools.js";
