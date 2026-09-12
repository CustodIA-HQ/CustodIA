import type { PortfolioSnapshot } from "@custodia/schema";
import { SEPOLIA_CHAIN_ID } from "@custodia/schema";
import { NATIVE_ETH, SEPOLIA_USDC, coverageFor } from "@custodia/registry";
import { createPublicClient, erc20Abi, formatEther, formatUnits, http } from "viem";
import { sepolia } from "viem/chains";

/** Explicitly scoped holdings, not a complete cross-chain portfolio. */
export async function readPortfolio(owner: `0x${string}`) {
  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com", {
      timeout: 10_000,
      retryCount: 1,
    }),
  });
  if ((await client.getChainId()) !== 11155111)
    throw new Error("Portfolio RPC must use Ethereum Sepolia testnet.");
  const blockNumber = await client.getBlockNumber();
  const [eth, usdc] = await Promise.all([
    client.getBalance({ address: owner, blockNumber }),
    client.readContract({
      address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
      blockNumber,
    }),
  ]);
  const observedAt = Math.floor(Date.now() / 1000);
  const coverage = coverageFor([NATIVE_ETH, SEPOLIA_USDC]);
  const snapshot: PortfolioSnapshot = {
    owner,
    vault: null,
    chainId: SEPOLIA_CHAIN_ID,
    block: Number(blockNumber),
    observedAt,
    holdings: [
      {
        asset: "eip155:11155111:eth",
        contract: NATIVE_ETH,
        symbol: "ETH",
        decimals: 18,
        balance: eth.toString(),
        where: "wallet",
      },
      {
        asset: "eip155:11155111:usdc",
        contract: SEPOLIA_USDC,
        symbol: "USDC",
        decimals: 6,
        balance: usdc.toString(),
        where: "wallet",
      },
    ],
    coverage,
    provenance: {
      chainId: SEPOLIA_CHAIN_ID,
      block: Number(blockNumber),
      observedAt,
      freshnessS: 0,
      source: "sepolia-rpc",
    },
  };
  return {
    owner,
    chain: "Ethereum Sepolia testnet",
    block: blockNumber.toString(),
    eth: formatEther(eth),
    usdc: formatUnits(usdc, 6),
    snapshot,
    scope:
      "Testnet ETH and Circle test USDC only. These tokens have no real monetary value. Other tokens, chains, lending and liquidity positions are not inspected. This is a current balance snapshot, not portfolio history. Vault balances are empty until Stage 4 funds a TaskVault.",
  };
}
