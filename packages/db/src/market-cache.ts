import { and, eq, gt } from "drizzle-orm";
import type { Db } from "./client.js";
import { marketCache } from "./schema.js";

/**
 * The MarketCache contract consumed by packages/graph (see
 * packages/graph/src/cache.ts). The Graph gateway has no payment batching, so
 * caching every market response is architecture: the cache sits in shared
 * Postgres so every risk-api instance and every agent run sees the same data.
 */
export interface MarketCache {
  /** Fresh value for `key`, or null when absent/expired. */
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttlS: number): Promise<void>;
}

export const MARKET_CACHE_TTL_S = 30;

export class PostgresMarketCache implements MarketCache {
  constructor(private readonly db: Db) {}

  async get(key: string): Promise<unknown> {
    const rows = await this.db
      .select({ payload: marketCache.payload, fetchedAt: marketCache.fetchedAt })
      .from(marketCache)
      .where(
        and(
          eq(marketCache.key, key),
          gt(marketCache.fetchedAt, new Date(Date.now() - MARKET_CACHE_TTL_S * 1000)),
        ),
      )
      .limit(1);
    const row = rows[0];
    return row ? row.payload : null;
  }

  async set(key: string, value: unknown, ttlS: number): Promise<void> {
    await this.db
      .insert(marketCache)
      .values({ key, payload: value, fetchedAt: new Date(), ttlS })
      .onConflictDoUpdate({
        target: marketCache.key,
        set: { payload: value, fetchedAt: new Date(), ttlS },
      });
  }
}
