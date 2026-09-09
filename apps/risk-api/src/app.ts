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
    const market = await getMarketContext("ETH/USDC", { cache });
    return c.json(computeRisk(market, input));
  });

  return app;
};
