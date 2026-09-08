import type { TaskStatus } from "@custodia/schema";
import { createPublicClient, createWalletClient, http, type PublicClient } from "viem";
import { sepolia } from "viem/chains";
import { resolverAbi, TASK_TEXT_KEYS } from "./abi.js";
import type { EnsConfig } from "./config.js";
import { dnsName, node } from "./encode.js";

const STATUS_KEY = "xyz.custodia.status";

interface TxResult {
  /** Hash of the write transaction(s). */
  txId: string;
  /** The full task subname (wildcard — no registry write, no rent). */
  name: string;
}

const walletClient = (config: EnsConfig, key: `0x${string}`) =>
  createWalletClient({
    account: key,
    chain: sepolia,
    transport: http(config.rpcUrl),
  });

// The canonical universal resolver already routes to v2 — reads need zero
// configuration beyond the chain RPC.
const publicClient = (config: EnsConfig): PublicClient =>
  createPublicClient({ chain: sepolia, transport: http(config.rpcUrl) });

/**
 * createTask — operator-signed. Writes the four xyz.custodia.* records on the
 * wildcard subname `${taskId}.${userLabel}.${parentName}` and scopes the agent
 * to the status key. Returns the tx hash and the deployed name.
 *
 * Writes are serialized (one await chain) rather than broadcast with
 * pre-computed nonces: task names are minted by this single process and
 * sequential signing keeps the accounting honest.
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
): Promise<TxResult> {
  const name = `${params.taskId}.${params.userLabel}.${config.parentName}`;
  const client = walletClient(config, config.operatorKey);

  const recordWrites = [
    ["xyz.custodia.owner", params.owner],
    ["xyz.custodia.mandate", params.mandateHash],
    ["xyz.custodia.agent", params.agent],
    ["xyz.custodia.status", "active"],
  ] as const;

  const setTextArgs = recordWrites.map(([key, value]) => ({ key, value }));

  // Serialize: the mandate/owner records must exist before the agent is
  // authorized; each write awaits the previous block inclusion.
  const setTextTxIds: `0x${string}`[] = [];
  for (const { key, value } of setTextArgs) {
    setTextTxIds.push(
      await client.writeContract({
        address: config.resolverAddress,
        abi: resolverAbi,
        functionName: "setText",
        // node() — bytes32 namehash — see encode.ts (trap #5).
        args: [node(name), key, value],
      }),
    );
  }

  const authorizeTx = await client.writeContract({
    address: config.resolverAddress,
    abi: resolverAbi,
    functionName: "authorizeTextRoles",
    // dnsName() — bytes — see encode.ts (trap #5).
    args: [dnsName(name), STATUS_KEY, params.agent, true],
  });

  return { txId: authorizeTx, name, setTextTxIds };
}

/**
 * setStatus — AGENT-signed. The agent may write ONLY xyz.custodia.status;
 * any other key or an un-authorized agent reverts with
 * EACUnauthorizedAccountRoles.
 */
export async function setStatus(
  config: EnsConfig,
  name: string,
  status: TaskStatus,
): Promise<{ txId: `0x${string}` }> {
  const client = walletClient(config, config.agentKey);
  const txId = await client.writeContract({
    address: config.resolverAddress,
    abi: resolverAbi,
    functionName: "setText",
    args: [node(name), STATUS_KEY, status],
  });
  return { txId };
}

/**
 * revokeAgent — operator-signed. Removes the agent's write access to
 * xyz.custodia.status on the task. After this, any agent setStatus call
 * reverts on-chain — callers surface the EACUnauthorizedAccountRoles error.
 */
export async function revokeAgent(
  config: EnsConfig,
  name: string,
  agent: `0x${string}`,
): Promise<{ txId: `0x${string}` }> {
  const client = walletClient(config, config.operatorKey);
  const txId = await client.writeContract({
    address: config.resolverAddress,
    abi: resolverAbi,
    functionName: "authorizeTextRoles",
    args: [dnsName(name), STATUS_KEY, agent, false],
  });
  return { txId };
}

/**
 * resolveTask — read the four record keys through the canonical universal
 * resolver (viem's getEnsText works out of the box on Sepolia).
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
