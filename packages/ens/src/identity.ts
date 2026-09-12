import { createPublicClient, http } from "viem";
import { sepolia } from "viem/chains";

export type OwnerAddress = `0x${string}`;

export const getParentName = (): string =>
  process.env.ENS_PARENT_NAME?.trim().toLowerCase() || "custodia.eth";

const LABEL_RE = /^[a-z0-9]([a-z0-9-]{1,61}[a-z0-9])$/;

const RESERVED_LABELS = new Set([
  "www",
  "api",
  "chat",
  "guard",
  "task",
  "telegram",
  "holdings",
  "admin",
  "operator",
  "agents",
  "custodia",
  "ens",
  "identity",
  "wallet",
  "ux",
]);

/** Parse `alice` or `alice.custodia.eth` into a label under the parent. */
export function parseClaimLabel(
  input: string,
  parentName = getParentName(),
): { ok: true; label: string; name: string } | { ok: false; error: string } {
  const raw = input.trim().toLowerCase();
  if (!raw) return { ok: false, error: "Enter the ENS name you want." };
  const parent = parentName.toLowerCase();
  const label = raw.endsWith(`.${parent}`) ? raw.slice(0, -(parent.length + 1)) : raw;
  if (label.includes(".")) {
    return { ok: false, error: `Use a single label under ${parent}, e.g. alice.${parent}` };
  }
  if (label.length < 3 || label.length > 63 || !LABEL_RE.test(label)) {
    return {
      ok: false,
      error:
        "Use 3–63 characters: lowercase letters, numbers, and hyphens (no leading/trailing hyphen).",
    };
  }
  if (RESERVED_LABELS.has(label) || label.startsWith("wallet-")) {
    return { ok: false, error: `"${label}" is reserved. Pick another name.` };
  }
  return { ok: true, label, name: `${label}.${parent}` };
}

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

export const makeOwnerName = (userLabel: string, parentName = getParentName()): string =>
  `${userLabel}.${parentName}`;

export const makeTaskName = (
  taskId: string,
  userLabel: string,
  parentName = getParentName(),
): string => `${taskId}.${makeOwnerName(userLabel, parentName)}`;
