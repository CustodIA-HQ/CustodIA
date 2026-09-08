/**
 * Market-data cache. The Graph has no payment batching (issue #1031) — every
 * query costs a payment on the paid gateway, so caching is architecture, not
 * optimisation. The Postgres-backed implementation lives in packages/db.
 */
export interface MarketCache {
  /** Fresh value for `key`, or null when absent/expired. */
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttlS: number): Promise<void>;
}

/** TTL for market context; 30 seconds keeps the demo live without hammering. */
export const MARKET_CACHE_TTL_S = 30;
