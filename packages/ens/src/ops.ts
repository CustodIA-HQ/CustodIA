import type { TaskStatus } from "@custodia/schema";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { resolverAbi, TASK_TEXT_KEYS } from "./abi.js";
import type { EnsConfig } from "./config.js";
import { dnsName, node } from "./encode.js";

const STATUS_KEY = "xyz.custodia.status";

export interface CreateTaskResult {
  /** The full task subname (wildcard — no registry write, no rent). */
  name: string;
  /** Hash of the multicall that wrote the four records. */
  recordsTxId: `0x${string}`;
  /** Hash of the authorizeTextRoles call that scoped the agent to the status key. */
  txId: `0x${string}`;
}

// Local accounts sign here and broadcast a raw tx. A bare hex key would be
// treated by viem as a JSON-RPC *address* and fail on a public RPC.
const walletClient = (config: EnsConfig, key: `0x${string}`) =>
  createWalletClient({
    account: privateKeyToAccount(key),
    chain: sepolia,
    transport: http(config.rpcUrl, { timeout: 30_000 }),
  });

// The canonical universal resolver already routes to v2 — reads need zero
// configuration beyond the chain RPC.
const publicClient = (config: EnsConfig): PublicClient =>
  createPublicClient({ chain: sepolia, transport: http(config.rpcUrl, { timeout: 30_000 }) });

/** Wait for inclusion and fail loudly on an on-chain revert. */
const confirmed = async (
  client: PublicClient,
  hash: `0x${string}`,
  what: string,
): Promise<`0x${string}`> => {
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`${what} reverted on-chain: ${hash}`);
  return hash;
};

/**
 * createTask — operator-signed. Writes the four xyz.custodia.* records on the
 * wildcard subname `${taskId}.${userLabel}.${parentName}` in ONE multicall,
 * waits for inclusion, then scopes the agent to the status key. Two
 * transactions, each confirmed before the next — no nonce races.
 */
export async function createTask(
  config: EnsConfig,
  params: {
    userLabel: string;
    taskId: string;
    mandateHash: `0x${string}`;
    owner: `0x${string}`;
    agent: `0x${string}`;
  },
): Promise<CreateTaskResult> {
  const name = `${params.taskId}.${params.userLabel}.${config.parentName}`;
  const wallet = walletClient(config, config.operatorKey);
  const pub = publicClient(config);

  const records: Record<(typeof TASK_TEXT_KEYS)[number], string> = {
    "xyz.custodia.owner": params.owner,
    "xyz.custodia.mandate": params.mandateHash,
    "xyz.custodia.agent": params.agent,
    "xyz.custodia.status": "active",
  };
  const calls = TASK_TEXT_KEYS.map((key) =>
    encodeFunctionData({
      abi: resolverAbi,
      functionName: "setText",
      // node() — bytes32 namehash — see encode.ts (trap #5).
      args: [node(name), key, records[key]],
    }),
  );
  const recordsTxId = await confirmed(
    pub,
    await wallet.writeContract({
      address: config.resolverAddress,
      abi: resolverAbi,
      functionName: "multicall",
      args: [calls],
    }),
    "setText multicall",
  );

  const txId = await confirmed(
    pub,
    await wallet.writeContract({
      address: config.resolverAddress,
      abi: resolverAbi,
      functionName: "authorizeTextRoles",
      // dnsName() — bytes — see encode.ts (trap #5).
      args: [dnsName(name), STATUS_KEY, params.agent, true],
    }),
    "authorizeTextRoles",
  );

  return { name, recordsTxId, txId };
}

/**
 * setStatus — AGENT-signed. The agent may write ONLY xyz.custodia.status on
 * the tasks it was scoped to; anything else reverts with
 * EACUnauthorizedAccountRoles (decodable thanks to the ABI error entry).
 */
export async function setStatus(
  config: EnsConfig,
  name: string,
  status: TaskStatus,
): Promise<{ txId: `0x${string}` }> {
  const wallet = walletClient(config, config.agentKey);
  const pub = publicClient(config);
  const txId = await confirmed(
    pub,
    await wallet.writeContract({
      address: config.resolverAddress,
      abi: resolverAbi,
      functionName: "setText",
      args: [node(name), STATUS_KEY, status],
    }),
    "setStatus",
  );
  return { txId };
}

/**
 * revokeAgent — operator-signed. Removes the agent's write access to
 * xyz.custodia.status on ONE task; sibling tasks are untouched.
 */
export async function revokeAgent(
  config: EnsConfig,
  name: string,
  agent: `0x${string}`,
): Promise<{ txId: `0x${string}` }> {
  const wallet = walletClient(config, config.operatorKey);
  const pub = publicClient(config);
  const txId = await confirmed(
    pub,
    await wallet.writeContract({
      address: config.resolverAddress,
      abi: resolverAbi,
      functionName: "authorizeTextRoles",
      args: [dnsName(name), STATUS_KEY, agent, false],
    }),
    "revokeAgent",
  );
  return { txId };
}

/**
 * resolveTask — read the four record keys through the canonical universal
 * resolver (viem's getEnsText works out of the box on Sepolia, wildcard
 * subnames included).
 */
export async function resolveTask(
  config: EnsConfig,
  name: string,
): Promise<Record<(typeof TASK_TEXT_KEYS)[number], string | null>> {
  const client = publicClient(config);
  const entries = await Promise.all(
    TASK_TEXT_KEYS.map(async (key) => [key, await client.getEnsText({ name, key })] as const),
  );
  return Object.fromEntries(entries) as Record<(typeof TASK_TEXT_KEYS)[number], string | null>;
}
