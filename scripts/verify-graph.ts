import { resolve } from "node:path";
import dotenv from "dotenv";
import { GraphQLClient, gql } from "graphql-request";

dotenv.config({ path: resolve(process.cwd(), ".env") });

async function main() {
  console.log("Verifying The Graph synchronization for Uniswap V3 on Arbitrum...");

  const apiKey = process.env.GRAPH_STUDIO_KEY;
  if (!apiKey) {
    throw new Error("Missing GRAPH_STUDIO_KEY in environment variables");
  }

  // The Uniswap V3 subgraph ID requested by the user
  const endpoint = `https://gateway-arbitrum.network.thegraph.com/api/${apiKey}/subgraphs/id/4cKy6QQMc5tpfdx8yxfYeb9TLZmgLQe44ddW1G7NwkA6`;
  const client = new GraphQLClient(endpoint);

  const query = gql`
    query GetMeta {
      _meta {
        block {
          number
        }
        hasIndexingErrors
      }
    }
  `;

  try {
    const data: any = await client.request(query);
    const meta = data?._meta;

    if (!meta) {
      throw new Error("Failed to retrieve _meta from the subgraph response.");
    }

    console.log(`  ✓ Subgraph is synced to block number: ${meta.block.number}`);

    if (meta.hasIndexingErrors) {
      console.error("\n❌ FATAL: indexing_error detected. The subgraph is in a faulty state.");
      process.exit(1);
    } else {
      console.log("  ✓ No indexing errors detected.");
      console.log("\n🎉 The Graph synchronization verification completed successfully.");
    }
  } catch (error) {
    console.error("\n❌ Fatal error executing GraphQL query:");
    console.error(error);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n❌ Fatal script error:", err);
  process.exit(1);
});
