import { beforeEach, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => ({
  getChainId: vi.fn(),
  getBlockNumber: vi.fn(),
  getBalance: vi.fn(),
  readContract: vi.fn(),
}));
vi.mock("viem", async (original) => ({
  ...(await original<typeof import("viem")>()),
  createPublicClient: () => rpc,
}));

import { readPortfolio } from "./portfolio.js";

const owner = "0x1111111111111111111111111111111111111111";
beforeEach(() => {
  vi.clearAllMocks();
  rpc.getChainId.mockResolvedValue(11155111);
  rpc.getBlockNumber.mockResolvedValue(123n);
  rpc.getBalance.mockResolvedValue(2000000000000000000n);
  rpc.readContract.mockResolvedValue(3000000n);
});
it("reads Sepolia ETH and Circle test USDC at the same block", async () => {
  const result = await readPortfolio(owner);
  expect(result).toMatchObject({ chain: "Ethereum Sepolia testnet", eth: "2", usdc: "3" });
  expect(rpc.getBalance).toHaveBeenCalledWith({ address: owner, blockNumber: 123n });
  expect(rpc.readContract).toHaveBeenCalledWith(
    expect.objectContaining({
      address: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
      args: [owner],
      blockNumber: 123n,
    }),
  );
});
it("rejects a mainnet RPC before reading balances", async () => {
  rpc.getChainId.mockResolvedValue(1);
  await expect(readPortfolio(owner)).rejects.toThrow("Sepolia");
  expect(rpc.getBalance).not.toHaveBeenCalled();
});
