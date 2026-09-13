import type { Mandate } from "@custodia/schema";
import {
  type Address,
  encodeFunctionData,
  formatUnits,
  type Hex,
  type PublicClient,
  parseUnits,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { taskVaultAbi, taskVaultBytecode } from "./abi.js";

export { taskVaultAbi, taskVaultBytecode };

// ─── Sepolia constants (verified on-chain 2026-09-13) ─────────────────────────

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA = {
  /** Uniswap V3 SwapRouter02 — the only router the vault will ever call. */
  router: "0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E",
  /** Uniswap V3 QuoterV2 — read-only quotes for minOut. */
  quoter: "0xEd1f6473345F45b75F8179591dd5bA1888cf2FB3",
  weth: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
  usdc: "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238",
  /** WETH/USDC 0.05 % pool: ~130 WETH / 3.4 M USDC of test liquidity. */
  poolFee: 500,
} as const;

export const VAULT_ASSETS = { ETH: SEPOLIA.weth, USDC: SEPOLIA.usdc } as const;
export type VaultAsset = keyof typeof VAULT_ASSETS;
export const DECIMALS: Record<VaultAsset, number> = { ETH: 18, USDC: 6 };

/** Default cooldown between actions when the mandate does not say otherwise. */
export const DEFAULT_MIN_INTERVAL_S = 60;
/** A policy approval is valid this long; the worker submits well inside it. */
export const APPROVAL_TTL_S = 120;

// ─── Mandate → on-chain limits ───────────────────────────────────────────────

export interface VaultCaps {
  weth: { maxTrade: bigint; maxCumulative: bigint };
  usdc: { maxTrade: bigint; maxCumulative: bigint };
  expiry: bigint;
  minIntervalS: number;
}

const find = <T extends Mandate["constraints"][number]["type"]>(mandate: Mandate, type: T) =>
  mandate.constraints.find((c: Mandate["constraints"][number]) => c.type === type) as
    | Extract<Mandate["constraints"][number], { type: T }>
    | undefined;

/**
 * The USD limits the owner signed, converted to raw token units at the ETH
 * price observed when the vault is installed. The contract enforces raw
 * units; the policy engine keeps enforcing USD off-chain with live prices.
 * Missing limits default to zero (nothing executable), never to "unlimited".
 */
export const capsFromMandate = (mandate: Mandate, ethPriceUsd: number): VaultCaps => {
  const maxTradeUsd = find(mandate, "custodia.max_trade_usd.1")?.value ?? 0;
  const maxNotionalUsd = find(mandate, "custodia.max_notional_usd.1")?.value ?? maxTradeUsd;
  const usd = (v: number) => parseUnits(v.toFixed(6), 6);
  const eth = (v: number) => parseUnits((v / ethPriceUsd).toFixed(18), 18);
  return {
    weth: { maxTrade: eth(maxTradeUsd), maxCumulative: eth(maxNotionalUsd) },
    usdc: { maxTrade: usd(maxTradeUsd), maxCumulative: usd(maxNotionalUsd) },
    expiry: BigInt(mandate.exp),
    minIntervalS: DEFAULT_MIN_INTERVAL_S,
  };
};

/** Constructor args for the owner's deployment transaction. */
export const deployArgs = (params: {
  owner: Address;
  executionSigner: Address;
  policySigner: Address;
  mandateHash: Hex;
  mandateVersion: number;
  caps: VaultCaps;
}) =>
  [
    params.owner,
    params.executionSigner,
    params.policySigner,
    SEPOLIA.router,
    SEPOLIA.weth,
    SEPOLIA.usdc,
    SEPOLIA.poolFee,
    {
      hash: params.mandateHash,
      version: BigInt(params.mandateVersion),
      expiry: params.caps.expiry,
      minIntervalS: params.caps.minIntervalS,
      wethCap: params.caps.weth,
      usdcCap: params.caps.usdc,
    },
  ] as const;

// ─── Reading a vault ─────────────────────────────────────────────────────────

export interface VaultState {
  address: Address;
  owner: Address;
  executionSigner: Address;
  policySigner: Address;
  mandateHash: Hex;
  active: boolean;
  expiry: number;
  minIntervalS: number;
  actionNonce: number;
  lastActionAt: number;
  weth: bigint;
  usdc: bigint;
  caps: {
    weth: { maxTrade: bigint; maxCumulative: bigint };
    usdc: { maxTrade: bigint; maxCumulative: bigint };
  };
  spent: { weth: bigint; usdc: bigint };
}

export async function readVault(client: PublicClient, address: Address): Promise<VaultState> {
  const c = { address, abi: taskVaultAbi } as const;
  const [
    owner,
    executionSigner,
    policySigner,
    mandate,
    nonce,
    lastActionAt,
    balances,
    wCap,
    uCap,
    wSpent,
    uSpent,
  ] = await Promise.all([
    client.readContract({ ...c, functionName: "owner" }),
    client.readContract({ ...c, functionName: "executionSigner" }),
    client.readContract({ ...c, functionName: "policySigner" }),
    client.readContract({ ...c, functionName: "mandate" }),
    client.readContract({ ...c, functionName: "actionNonce" }),
    client.readContract({ ...c, functionName: "lastActionAt" }),
    client.readContract({ ...c, functionName: "balances" }),
    client.readContract({ ...c, functionName: "caps", args: [SEPOLIA.weth] }),
    client.readContract({ ...c, functionName: "caps", args: [SEPOLIA.usdc] }),
    client.readContract({ ...c, functionName: "spent", args: [SEPOLIA.weth] }),
    client.readContract({ ...c, functionName: "spent", args: [SEPOLIA.usdc] }),
  ]);
  return {
    address,
    owner,
    executionSigner,
    policySigner,
    mandateHash: mandate[0],
    active: mandate[4],
    expiry: Number(mandate[2]),
    minIntervalS: Number(mandate[3]),
    actionNonce: Number(nonce),
    lastActionAt: Number(lastActionAt),
    weth: balances[0],
    usdc: balances[1],
    caps: {
      weth: { maxTrade: wCap[0], maxCumulative: wCap[1] },
      usdc: { maxTrade: uCap[0], maxCumulative: uCap[1] },
    },
    spent: { weth: wSpent, usdc: uSpent },
  };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

export interface VaultAction {
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minOut: bigint;
  nonce: bigint;
  deadline: bigint;
  mandateHash: Hex;
}

const quoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

/** Expected output for an exact-input swap through the vault's pool, from the on-chain quoter. */
export async function quoteExactInput(
  client: PublicClient,
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
): Promise<bigint> {
  const { result } = await client.simulateContract({
    address: SEPOLIA.quoter,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [{ tokenIn, tokenOut, amountIn, fee: SEPOLIA.poolFee, sqrtPriceLimitX96: 0n }],
  });
  return result[0];
}

export const applySlippage = (amountOut: bigint, slippageBps: number): bigint =>
  (amountOut * BigInt(10_000 - slippageBps)) / 10_000n;

/** EIP-712 typed data the policy signer signs; must match TaskVault.actionDigest exactly. */
export const actionTypedData = (vault: Address, action: VaultAction) =>
  ({
    domain: {
      name: "CustodIA TaskVault",
      version: "1",
      chainId: SEPOLIA_CHAIN_ID,
      verifyingContract: vault,
    },
    types: {
      Action: [
        { name: "tokenIn", type: "address" },
        { name: "tokenOut", type: "address" },
        { name: "amountIn", type: "uint256" },
        { name: "minOut", type: "uint256" },
        { name: "nonce", type: "uint64" },
        { name: "deadline", type: "uint64" },
        { name: "mandateHash", type: "bytes32" },
      ],
    },
    primaryType: "Action",
    message: action,
  }) as const;

/**
 * The policy signer's approval: a short-lived signature over one exact action
 * for one vault. Its key lives only in the worker env and never sends a
 * transaction. The execution signer cannot forge it; the vault verifies it.
 */
export async function signActionApproval(
  policyPrivateKey: Hex,
  vault: Address,
  action: VaultAction,
): Promise<Hex> {
  const account = privateKeyToAccount(policyPrivateKey);
  return account.signTypedData(actionTypedData(vault, action));
}

/** Calldata for TaskVault.executeSwap, for the execution signer to send. */
export const executeSwapCalldata = (action: VaultAction, policySig: Hex): Hex =>
  encodeFunctionData({ abi: taskVaultAbi, functionName: "executeSwap", args: [action, policySig] });

export async function sendExecuteSwap(
  wallet: WalletClient,
  vault: Address,
  action: VaultAction,
  policySig: Hex,
): Promise<Hex> {
  if (!wallet.account || !wallet.chain) throw new Error("execution wallet needs account and chain");
  return wallet.writeContract({
    account: wallet.account,
    chain: wallet.chain,
    address: vault,
    abi: taskVaultAbi,
    functionName: "executeSwap",
    args: [action, policySig],
  });
}

// ─── Formatting ──────────────────────────────────────────────────────────────

export const assetOf = (token: Address): VaultAsset =>
  token.toLowerCase() === SEPOLIA.weth.toLowerCase() ? "ETH" : "USDC";

export const formatAmount = (token: Address, raw: bigint): string => {
  const asset = assetOf(token);
  const value = Number(formatUnits(raw, DECIMALS[asset]));
  return `${value.toLocaleString("en-US", { maximumFractionDigits: asset === "ETH" ? 5 : 2 })} ${asset}`;
};

export const etherscanTx = (hash: Hex): string => `https://sepolia.etherscan.io/tx/${hash}`;
export const etherscanAddress = (address: Address): string =>
  `https://sepolia.etherscan.io/address/${address}`;
