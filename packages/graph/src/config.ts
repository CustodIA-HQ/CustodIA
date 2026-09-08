import { NotImplementedError } from "@custodia/schema";

/**
 * The Graph Studio API key. The free tier (100K queries/month) is enough for
 * the prototype. testnet.gateway.thegraph.com has no DNS record — never use it.
 *
 * Deliberately lazy: importing this package must never throw, so the web app
 * and agent can boot without a key. Only an actual query fails — loudly.
 */
let studioKey: string | undefined;
const ensureStudioKey = (): string => {
  if (!studioKey) {
    const key = process.env.GRAPH_STUDIO_KEY;
    if (!key) throw new NotImplementedError("GRAPH_STUDIO_KEY (The Graph Studio, free tier)");
    studioKey = key;
  }
  return studioKey;
};

export const graphEndpoint = (subgraphId: string): string =>
  `https://gateway.thegraph.com/api/${ensureStudioKey()}/subgraphs/id/${subgraphId}`;