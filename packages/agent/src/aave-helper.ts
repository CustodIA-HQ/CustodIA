/**
 * Thin shim so `agents.ts` can lazily import Aave data without a circular dep.
 * The real implementation lives in `packages/graph/src/aave.ts`.
 */
import { getAaveCollateral } from "@custodia/graph";

export async function getAaveData(
  wallet: string,
): Promise<{ totalCollateralUSD: string; healthFactor: string } | null> {
  const result = await getAaveCollateral(wallet);
  if (!result.user) return null;
  return {
    totalCollateralUSD: result.user.totalCollateralUSD,
    healthFactor: result.user.healthFactor,
  };
}
