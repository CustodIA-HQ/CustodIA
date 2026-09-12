import type { Capability } from "@custodia/schema";
import { SEPOLIA_CHAIN_ID } from "@custodia/schema";

/** Native ETH sentinel used by the registry (not a deployed ERC-20). */
export const NATIVE_ETH = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;

/** Circle faucet USDC on Ethereum Sepolia. */
export const SEPOLIA_USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238" as const;

/** Canonical WETH on Ethereum Sepolia. */
export const SEPOLIA_WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14" as const;

const SEED: Capability[] = [
  {
    id: "eip155:11155111:eth",
    chainId: SEPOLIA_CHAIN_ID,
    contract: NATIVE_ETH,
    symbol: "ETH",
    decimals: 18,
    status: "evaluable",
    native: true,
    version: 1,
  },
  {
    id: "eip155:11155111:weth",
    chainId: SEPOLIA_CHAIN_ID,
    contract: SEPOLIA_WETH,
    symbol: "WETH",
    decimals: 18,
    status: "observable",
    exclusionReason:
      "Wrapped ETH is observed; execution wraps/unwraps via the native ETH capability.",
    version: 1,
  },
  {
    id: "eip155:11155111:usdc",
    chainId: SEPOLIA_CHAIN_ID,
    contract: SEPOLIA_USDC,
    symbol: "USDC",
    decimals: 6,
    status: "evaluable",
    version: 1,
  },
];

const byContract = new Map(SEED.map((c) => [c.contract.toLowerCase(), c]));

export const listCapabilities = (chainId = SEPOLIA_CHAIN_ID): Capability[] =>
  SEED.filter((c) => c.chainId === chainId);

export const getCapability = (
  contract: string,
  chainId = SEPOLIA_CHAIN_ID,
): Capability | undefined => {
  const found = byContract.get(contract.toLowerCase());
  return found?.chainId === chainId ? found : undefined;
};

export const coverageFor = (
  contracts: string[],
  chainId = SEPOLIA_CHAIN_ID,
): { supported: string[]; unsupported: Array<{ contract: `0x${string}`; reason: string }> } => {
  const supported: string[] = [];
  const unsupported: Array<{ contract: `0x${string}`; reason: string }> = [];
  for (const contract of contracts) {
    const cap = getCapability(contract, chainId);
    if (cap) supported.push(cap.id);
    else
      unsupported.push({
        contract: contract as `0x${string}`,
        reason: "Not in the versioned Sepolia capability registry",
      });
  }
  return { supported, unsupported };
};
