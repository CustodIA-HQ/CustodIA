import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

export type OwnerAddress = `0x${string}`;

export const getParentName = (): string =>
  process.env.ENS_PARENT_NAME?.trim().toLowerCase() || "custodia.eth";

const fallbackLabel = (owner: OwnerAddress): string => `wallet-${owner.slice(2, 10).toLowerCase()}`;

const labelFromEnsName = (name: string | null): string | null => {
  const label = name?.split(".")[0]?.trim().toLowerCase();
  return label && /^[a-z0-9-]{1,63}$/.test(label) ? label : null;
};

const ensLabelCache = new Map<string, string>();

/**
 * Prefer the owner's Sepolia reverse ENS label, falling back to a stable
 * wallet-derived label. Reverse records are a display hint only: the signed
 * wallet remains the identity boundary, so an unavailable RPC never changes
 * ownership.
 */
export async function getUserLabel(owner: OwnerAddress): Promise<string> {
  const cacheKey = owner.toLowerCase();
  const cached = ensLabelCache.get(cacheKey);
  if (cached) return cached;

  const fallback = fallbackLabel(owner);
  const rpcUrl = process.env.SEPOLIA_RPC_URL?.trim();
  if (!rpcUrl) {
    ensLabelCache.set(cacheKey, fallback);
    return fallback;
  }
  try {
    const client = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl, { timeout: 8_000 }),
    });
    const label = labelFromEnsName(await client.getEnsName({ address: owner }));
    const result = label ?? fallback;
    ensLabelCache.set(cacheKey, result);
    return result;
  } catch {
    ensLabelCache.set(cacheKey, fallback);
    return fallback;
  }
}

export const makeTaskName = (
  taskId: string,
  userLabel: string,
  parentName = getParentName(),
): string => `${taskId}.${userLabel}.${parentName}`;
