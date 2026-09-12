import { GraphQLClient, gql } from "graphql-request";
import { z } from "zod";

const SubgraphUserCollateralSchema = z.object({
  user: z
    .object({
      id: z.string(),
      totalCollateralUSD: z.string().optional().default("0"),
      totalBorrowsUSD: z.string().optional().default("0"),
      healthFactor: z.string().optional().default("0"),
    })
    .nullable(),
});

/**
 * Aave v3 Collateral Adapter (The Graph).
 * Points to the hardcoded ID through the Studio Gateway.
 */
export async function getAaveCollateral(walletAddress: string) {
  const apiKey = process.env.GRAPH_STUDIO_KEY;
  if (!apiKey) throw new Error("Missing GRAPH_STUDIO_KEY in environment");

  const endpoint = `https://gateway-arbitrum.network.thegraph.com/api/${apiKey}/subgraphs/id/JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk`;
  const client = new GraphQLClient(endpoint);

  const query = gql`
    query GetUserData($userId: ID!) {
      user(id: $userId) {
        id
        totalCollateralUSD
        totalBorrowsUSD
        healthFactor
      }
    }
  `;

  // subgraph IDs are strictly lowercase
  const data = await client.request(query, { userId: walletAddress.toLowerCase() });

  return SubgraphUserCollateralSchema.parse(data);
}

/**
 * Job Handler wrapper for the new runtime.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const aaveHandler = async ({
  job,
  heartbeat,
}: {
  job: { payload: unknown };
  heartbeat: () => Promise<void>;
}) => {
  await heartbeat();
  const walletAddress = (job.payload as { walletAddress?: string } | undefined)?.walletAddress;
  if (!walletAddress) throw new Error("Missing walletAddress in payload");
  await getAaveCollateral(walletAddress);
};
