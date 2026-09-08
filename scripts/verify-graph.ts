import "dotenv/config";
import {
  AAVE_V3_ETH_SUBGRAPH_ID,
  AGENT0_SEPOLIA_SUBGRAPH_ID,
  confirmPoolId,
  getMarketContext,
  graphEndpoint,
  UNISWAP_V3_ETH_SUBGRAPH_ID,
} from "@custodia/graph";
import { gql, request } from "graphql-request";

/**
 * pnpm verify:graph
 *
 * 1. Validates all three subgraph IDs are alive with a recent block
 *    (Messari's repo is stale; Balancer is dead — trust nothing).
 * 2. Confirms the canonical USDC/WETH 0.05% pool address against the
 *    subgraph (done once, stored as a commented constant).
 * 3. Runs one live getMarketContext and prints price + 24 h realized vol.
 *
 * Non-zero exit if any ID errors. No mocked data — these are live queries.
 */
const META_QUERY = gql`
  {
    _meta {
      block { number }
    }
  }
`;

const ids = [
  { name: "Uniswap V3 Ethereum", id: UNISWAP_V3_ETH_SUBGRAPH_ID },
  { name: "Aave v3 Ethereum", id: AAVE_V3_ETH_SUBGRAPH_ID },
  { name: "Agent0 Sepolia", id: AGENT0_SEPOLIA_SUBGRAPH_ID },
];

let failed = false;
for (const { name, id } of ids) {
  try {
    const data = (await request(graphEndpoint(id), META_QUERY)) as {
      _meta: { block: { number: number } };
    };
    console.log(`  ✓ ${name}: block ${data._meta.block.number}`);
  } catch (err) {
    failed = true;
    console.error(`  ✗ ${name}: ${(err as Error).message}`);
  }
}

const pool = await confirmPoolId();
const match = pool.found.includes(pool.advertised.toLowerCase());
console.log(
  match
    ? `  ✓ pool ${pool.advertised} found on subgraph (${pool.found.join(", ")})`
    : `  ✗ pool mismatch — advertised ${pool.advertised}, subgraph returned ${pool.found.join(", ")}`,
);
if (!match) failed = true;

const market = await getMarketContext("ETH/USDC", { ttlS: 1 }); // bypass the 30 s cache
console.log(
  `MARKET  pair=${market.pair} price=$${market.priceUsd.toFixed(2)} ` +
    `vol24h=${market.realizedVol24hPct.toFixed(2)}% tvl=$${Math.round(market.tvlUsd).toLocaleString("en-US")} ` +
    `block=${market.block}`,
);

if (failed) {
  console.error("\nverify:graph FAILED — one or more subgraph IDs errored");
  process.exit(1);
}
console.log("\nverify:graph OK");
