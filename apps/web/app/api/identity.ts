import "../env";

import { NotImplementedError } from "@custodia/schema";
import { createPublicClient, getAddress, http, isAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

export type WebAddress = `0x${string}`;

export const normalizeAddress = (value: string, name = "address"): WebAddress => {
  if (!isAddress(value)) throw new Error(`${name} must be a 20-byte hex address`);
  return getAddress(value) as WebAddress;
};

export const getAgentAddress = (): WebAddress => {
  const privateKey = process.env.AGENT_PRIVATE_KEY?.trim();
  if (!privateKey || !/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new NotImplementedError("AGENT_PRIVATE_KEY (agent identity)");
  }
  return privateKeyToAccount(privateKey as `0x${string}`).address;
};

export const getParentName = (): string =>
  process.env.ENS_PARENT_NAME?.trim().toLowerCase() || "custodia.eth";

const fallbackLabel = (owner: WebAddress): string => `wallet-${owner.slice(2, 10).toLowerCase()}`;

const labelFromEnsName = (name: string | null): string | null => {
  const label = name?.split(".")[0]?.trim().toLowerCase();
  return label && /^[a-z0-9-]{1,63}$/.test(label) ? label : null;
};

const ensLabelCache = new Map<string, string>();

/**
 * Prefer the requester's Sepolia reverse ENS label, while retaining a stable
 * wallet-derived label for addresses without a reverse record.
 */
export async function getUserLabel(owner: WebAddress): Promise<string> {
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
    // Reverse records are a display hint. The signed wallet remains the
    // identity boundary, so an unavailable RPC must not change ownership.
    ensLabelCache.set(cacheKey, fallback);
    return fallback;
  }
}

export const makeTaskName = (
  taskId: string,
  userLabel: string,
  parentName = getParentName(),
): string => `${taskId}.${userLabel}.${parentName}`;
