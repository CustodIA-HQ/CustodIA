import { coverageFor, NATIVE_ETH, SEPOLIA_USDC, SEPOLIA_WETH } from "@custodia/registry";
import type { PortfolioSnapshot } from "@custodia/schema";
import { SEPOLIA_CHAIN_ID } from "@custodia/schema";
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
  const erc20Balance = (address: `0x${string}`) =>
    client.readContract({
      address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
      blockNumber,
    });
  const [eth, usdc, weth] = await Promise.all([
    client.getBalance({ address: owner, blockNumber }),
    erc20Balance(SEPOLIA_USDC),
    // WETH is *observable* in the registry: shown as a holding, not evaluable
    // or tradable until the vault wraps/unwraps it (Stage 4).
    erc20Balance(SEPOLIA_WETH),
  ]);
  const observedAt = Math.floor(Date.now() / 1000);
  const coverage = coverageFor([NATIVE_ETH, SEPOLIA_USDC, SEPOLIA_WETH]);
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
      {
        asset: "eip155:11155111:weth",
        contract: SEPOLIA_WETH,
        symbol: "WETH",
        decimals: 18,
        balance: weth.toString(),
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
    weth: formatEther(weth),
    snapshot,
    scope:
      "Testnet ETH, Circle test USDC, and WETH (observable only — not tradable until a TaskVault exists). These tokens have no real monetary value. Other tokens, chains, lending and liquidity positions are not inspected. This is a current balance snapshot, not portfolio history. Vault balances are empty until Stage 4 funds a TaskVault.",
  };
}
