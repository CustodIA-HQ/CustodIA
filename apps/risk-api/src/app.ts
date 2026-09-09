import { createDb, PostgresMarketCache } from "@custodia/db";
import { getMarketContext } from "@custodia/graph";
import { RiskRequestInputSchema } from "@custodia/schema";
import type { RoutesConfig } from "@x402/core/server";
import { x402ResourceServer } from "@x402/core/server";
import type { Network } from "@x402/core/types";
import { ExactHederaScheme } from "@x402/hedera/exact/server";
import { paymentMiddleware } from "@x402/hono";
import { Hono } from "hono";
import type { RiskApiConfig } from "./config.js";
import { buildFacilitator } from "./facilitator.js";
import { computeRisk } from "./risk.js";

/**
 * The x402 risk gateway. Mirrors the workshop shop server
 * (blockydevs/wad2026-x402-workshop) middleware usage exactly.
 *
 * POST /risk/portfolio is gated behind an x402 payment priced at 0.1 HBAR
 * (10_000_000 tinybars, asset 0.0.0) to `payTo`, settled through the Blocky402
 * facilitator. Everything past the middleware has already been paid for.
 */

/**
 * Mirror Node Backoff — Hedera doc §6 trap: the mirror node takes 5–6 s to
 * reflect a settlement. We apply an explicit initial wait of 6 000 ms before
 * the first query, then double on each subsequent attempt (exponential backoff).
 *
 * Applied AFTER x402 payment is confirmed by the middleware, where the Mirror
 * Node lag actually matters. No Proxy on ExactHederaScheme — that avoids
 * guessing internal method names in @x402/hedera that may change.
 *
 * Sequence:  wait 6 s → try → fail → wait 12 s → try → fail → 24 s → 48 s
 */
const MIRROR_INITIAL_MS = 6_000;
const MIRROR_MAX_ATTEMPTS = 4;

async function withMirrorBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let delay = MIRROR_INITIAL_MS;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= MIRROR_MAX_ATTEMPTS; attempt++) {
    // Always wait before the first query too: absorbs the mirror node's
    // 5–6 s confirmation lag documented in QUICKREF.md and §6.
    await new Promise((res) => setTimeout(res, delay));
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      console.warn(`[mirror-backoff] attempt ${attempt}/${MIRROR_MAX_ATTEMPTS} failed:`, err);
      delay *= 2; // 6 s → 12 s → 24 s → 48 s
    }
  }
  throw lastErr;
}

export const createApp = (config: RiskApiConfig): Hono => {
  const app = new Hono();

  // ExactHederaScheme used directly — no Proxy wrapper needed.
  const x402Server = new x402ResourceServer(buildFacilitator(config.facilitatorUrl)).register(
    "hedera:*",
    new ExactHederaScheme(),
  );

  const routes: RoutesConfig = {
    "POST /risk/portfolio": {
      description: "Portfolio risk assessment — settled in HBAR on Hedera testnet",
      accepts: {
        scheme: "exact",
        network: config.hederaNetwork as Network,
        payTo: config.payTo,
        // 0.1 HBAR = 10,000,000 tinybars. Asset 0.0.0 = native HBAR.
        // Amounts ride the wire as decimal strings (uint64).
        price: { amount: "10000000", asset: "0.0.0" },
        maxTimeoutSeconds: 180,
      },
    },
  };

  app.onError((err, c) => {
    console.error(err);
    return c.json({ error: err instanceof Error ? err.message : "Internal server error" }, 500);
  });

  app.get("/health", (c) => c.json({ status: "ok" }));

  // The market cache is architecture: The Graph has no payment batching, so
  // every response is cached for 30 s in Postgres (shared across instances).
  const cache = new PostgresMarketCache(createDb());

  app.use("*", paymentMiddleware(routes, x402Server));

  app.post("/risk/portfolio", async (c) => {
    const input = RiskRequestInputSchema.parse(await c.req.json());
    // Payment is confirmed by the middleware above.
    // withMirrorBackoff absorbs the 5–6 s Hedera Mirror Node lag before
    // querying The Graph for the live market data that drives risk computation.
    const market = await withMirrorBackoff(() => getMarketContext("ETH/USDC", { cache }));
    return c.json(computeRisk(market, input));
  });

  return app;
};
