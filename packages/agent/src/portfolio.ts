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
  return {
    owner,
    chain: "Ethereum Sepolia testnet",
    block: blockNumber.toString(),
    eth: formatEther(eth),
    usdc: formatUnits(usdc, 6),
    scope:
      "Testnet ETH and Circle test USDC only. These tokens have no real monetary value. Other tokens, chains, lending and liquidity positions are not inspected. This is a current balance snapshot, not portfolio history.",
  };
}
