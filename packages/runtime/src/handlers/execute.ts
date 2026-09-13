import { PostgresMarketCache, tables } from "@custodia/db";
import { getMarketContext } from "@custodia/graph";
import { evaluate } from "@custodia/policy";
import { type Mandate, NotImplementedError } from "@custodia/schema";
import {
  APPROVAL_TTL_S,
  applySlippage,
  assetOf,
  etherscanTx,
  formatAmount,
  quoteExactInput,
  readVault,
  SEPOLIA,
  sendExecuteSwap,
  signActionApproval,
  taskVaultAbi,
  type VaultAction,
} from "@custodia/vault";
import { eq } from "drizzle-orm";
import {
  type Address,
  createPublicClient,
  createWalletClient,
  formatUnits,
  type Hex,
  http,
  parseEventLogs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { notifyOwner, queueChannelMessageForRun } from "../channels.js";
import type { JobHandler } from "../registry.js";
import { loadLatestMandate, loadTask } from "../tasks.js";

/** Adverse slippage tolerated between the quote and the fill. */
const SLIPPAGE_BPS = 50;
/** Blocks to wait before telling the user "done". */
const CONFIRMATIONS = 2;

const rpc = () => {
  const url = process.env.SEPOLIA_RPC_URL?.trim();
  if (!url) throw new NotImplementedError("SEPOLIA_RPC_URL (vault execution)");
  return http(url);
};
const publicClient = () => createPublicClient({ chain: sepolia, transport: rpc() });
const executionWallet = () => {
  const key = process.env.EXECUTION_PRIVATE_KEY?.trim();
  if (!key) throw new NotImplementedError("EXECUTION_PRIVATE_KEY (vault execution)");
  return createWalletClient({
    account: privateKeyToAccount(key as Hex),
    chain: sepolia,
    transport: rpc(),
  });
};
const policyKey = (): Hex => {
  const key = process.env.POLICY_SIGNER_PRIVATE_KEY?.trim();
  if (!key) throw new NotImplementedError("POLICY_SIGNER_PRIVATE_KEY (vault execution)");
  return key as Hex;
};

type ActionRow = typeof tables.actions.$inferSelect;

const usdOf = (token: Address, raw: bigint, ethPriceUsd: number): number =>
  assetOf(token) === "ETH"
    ? Number(formatUnits(raw, 18)) * ethPriceUsd
    : Number(formatUnits(raw, 6));

/**
 * kind: execute — payload { actionId }. Runs one order through the boundary:
 *
 *   previewed → (policy + vault pre-checks) → approved (policy signature, nonce)
 *   → submitted (tx hash persisted before waiting) → confirmed | reverted
 *   or refused, with the reason, before anything is sent.
 *
 * Every step is persisted before the next, so a worker that dies mid-way
 * resumes from the row: a submitted tx is awaited, never resent; an approved
 * action whose nonce the vault already consumed is treated as executed.
 * The chat that asked gets one message at the end, with the tx link.
 */
export const executeHandler: JobHandler = async ({ db, job, heartbeat }) => {
  const { actionId } = job.payload as { actionId: string };
  const [action] = await db
    .select()
    .from(tables.actions)
    .where(eq(tables.actions.id, actionId))
    .limit(1);
  if (!action) throw new Error(`action ${actionId} not found`);
  if (["confirmed", "reverted", "refused"].includes(action.status)) return;

  const task = await loadTask(db, action.taskId);
  const mandateRow = await loadLatestMandate(db, action.taskId);
  if (!task || !mandateRow) throw new Error(`task or mandate missing for action ${actionId}`);
  // Captured after the guards so the nested settle() sees non-null rows.
  const taskRow = task;
  const actionRow = action;
  const mandate = mandateRow.typedData as Mandate;
  const vaultAddress = action.vault as Address;
  const client = publicClient();

  const update = (patch: Partial<ActionRow>) =>
    db
      .update(tables.actions)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(tables.actions.id, actionId));
  // A chat order answers in its chat; an agent-initiated action reaches every chat the owner paired.
  const agentInitiated = action.reason?.startsWith("agent:") ?? false;
  const prefix = agentInitiated ? `Agent action — ${action.reason?.slice(7)}.\n\n` : "";
  const notify = (text: string) =>
    action.runId
      ? queueChannelMessageForRun(db, action.runId, prefix + text)
      : notifyOwner(db, task.userWallet, prefix + text);
  const refuse = async (reason: string) => {
    await update({ status: "refused", reason });
    await db.insert(tables.outbox).values({
      channel: "web",
      target: task.userWallet,
      payload: { type: "action.refused", taskId: task.id, actionId, reason },
    });
    await notify(
      `Refused: ${reason}\n\nNothing moved. Adjust the boundary on the web: ${process.env.APP_URL ?? ""}/task/${task.id}`,
    );
  };

  // ── Resume a submitted transaction instead of resending it ───────────────
  if (action.status === "submitted" && action.txHash) {
    await settle(action.txHash as Hex);
    return;
  }

  const vault = await readVault(client, vaultAddress);
  if (task.status !== "active" || !vault.active)
    return refuse("the task is not active (revoked or expired)");
  if (vault.mandateHash.toLowerCase() !== (task.vaultMandateHash ?? "").toLowerCase()) {
    return refuse("the vault's installed mandate does not match this task");
  }
  const now = Math.floor(Date.now() / 1_000);
  if (now > vault.expiry) return refuse("the mandate has expired");

  // ── Resume an approved action whose nonce may already be consumed ────────
  if (action.status === "approved" && action.nonce !== null && vault.actionNonce > action.nonce) {
    await update({ status: "confirmed", reason: "executed before the worker restarted" });
    return;
  }

  // ── Size the order ───────────────────────────────────────────────────────
  const tokenIn = action.tokenIn as Address;
  const tokenOut = action.tokenOut as Address;
  const market = await getMarketContext("ETH/USDC", {
    cache: new PostgresMarketCache(db as never),
  });
  let amountIn = BigInt(action.amountIn);
  let minOut = 0n;
  if (amountIn === 0n && action.minOut) {
    // exact-output order: size the input from the quote, then re-quote that input
    const wanted = BigInt(action.minOut);
    const probe = assetOf(tokenIn) === "ETH" ? 10n ** 16n : 10n ** 7n; // 0.01 ETH or 10 USDC
    const probeOut = await quoteExactInput(client, tokenIn, tokenOut, probe);
    if (probeOut === 0n) return refuse("no liquidity for that pair right now");
    amountIn = (wanted * probe) / probeOut + 1n;
  }
  const balance = assetOf(tokenIn) === "ETH" ? vault.weth : vault.usdc;
  if (amountIn > balance) {
    return refuse(
      `the vault holds ${formatAmount(tokenIn, balance)}, less than the ${formatAmount(tokenIn, amountIn)} to sell`,
    );
  }
  const caps = assetOf(tokenIn) === "ETH" ? vault.caps.weth : vault.caps.usdc;
  const spent = assetOf(tokenIn) === "ETH" ? vault.spent.weth : vault.spent.usdc;
  if (amountIn > caps.maxTrade) {
    return refuse(
      `${formatAmount(tokenIn, amountIn)} exceeds the per-trade limit of ${formatAmount(tokenIn, caps.maxTrade)} you signed`,
    );
  }
  if (spent + amountIn > caps.maxCumulative) {
    return refuse(
      `this would take cumulative spending to ${formatAmount(tokenIn, spent + amountIn)}, over the ${formatAmount(tokenIn, caps.maxCumulative)} total you signed`,
    );
  }
  if (vault.lastActionAt && now < vault.lastActionAt + vault.minIntervalS) {
    return refuse(
      `cooldown: the next action is allowed in ${vault.lastActionAt + vault.minIntervalS - now}s`,
    );
  }

  // ── Off-chain policy: USD limits with the live price ─────────────────────
  const notionalUsd = usdOf(tokenIn, amountIn, market.priceUsd);
  const spentUsd = usdOf(tokenIn, spent, market.priceUsd);
  const decision = evaluate(
    mandate,
    {
      kind: "rebalance",
      fromAsset: assetOf(tokenIn),
      toAsset: assetOf(tokenOut),
      notionalUsd,
      reason: "chat order",
    },
    { spentUsd, now },
  );
  if (!decision.allowed) return refuse(decision.reason);

  // ── Quote and approve ────────────────────────────────────────────────────
  const quoted = await quoteExactInput(client, tokenIn, tokenOut, amountIn);
  if (quoted === 0n) return refuse("no liquidity for that pair right now");
  minOut = applySlippage(quoted, SLIPPAGE_BPS);
  const vaultAction: VaultAction = {
    tokenIn,
    tokenOut,
    amountIn,
    minOut,
    nonce: BigInt(vault.actionNonce),
    deadline: BigInt(now + APPROVAL_TTL_S),
    mandateHash: vault.mandateHash,
  };
  const policySig = await signActionApproval(policyKey(), vaultAddress, vaultAction);
  await update({
    status: "approved",
    nonce: vault.actionNonce,
    amountIn: amountIn.toString(),
    minOut: minOut.toString(),
    reason: agentInitiated ? action.reason : decision.reason,
  });
  await heartbeat();

  // ── Submit; persist the hash before waiting ──────────────────────────────
  let txHash: Hex;
  try {
    txHash = await sendExecuteSwap(executionWallet(), vaultAddress, vaultAction, policySig);
  } catch (error) {
    const message = error instanceof Error ? error.message.split("\n")[0] : String(error);
    await update({ status: "reverted", reason: message });
    await notify(`The vault rejected the order before sending: ${message}. Nothing moved.`);
    return;
  }
  await update({ status: "submitted", txHash });
  await settle(txHash);

  async function settle(hash: Hex) {
    const receipt = await client.waitForTransactionReceipt({
      hash,
      confirmations: CONFIRMATIONS,
      timeout: 180_000,
    });
    if (receipt.status !== "success") {
      await update({ status: "reverted", txHash: hash, reason: "transaction reverted on-chain" });
      await notify(`The swap reverted on-chain, so nothing moved. Tx: ${etherscanTx(hash)}`);
      return;
    }
    const [executed] = parseEventLogs({
      abi: taskVaultAbi,
      eventName: "Executed",
      logs: receipt.logs,
    });
    const amountOut = executed?.args.amountOut ?? 0n;
    const after = await readVault(client, vaultAddress);
    await update({ status: "confirmed", txHash: hash, amountOut: amountOut.toString() });
    await db.insert(tables.receipts).values({
      taskId: taskRow.id,
      kind: "vault_tx",
      txId: hash,
      network: "eip155:11155111",
      amount: amountOut.toString(),
      payload: {
        actionId,
        tokenIn: actionRow.tokenIn,
        tokenOut: actionRow.tokenOut,
        amountIn: actionRow.amountIn,
        amountOut: amountOut.toString(),
        block: Number(receipt.blockNumber),
      },
    });
    await db.insert(tables.outbox).values({
      channel: "web",
      target: taskRow.userWallet,
      payload: { type: "action.done", taskId: taskRow.id, actionId, txHash: hash },
    });
    await notify(
      `Done: swapped ${formatAmount(actionRow.tokenIn as Address, BigInt(actionRow.amountIn))} → ${formatAmount(actionRow.tokenOut as Address, amountOut)}.\nVault now: ${formatAmount(SEPOLIA.weth, after.weth)} · ${formatAmount(SEPOLIA.usdc, after.usdc)}.\nTx: ${etherscanTx(hash)}`,
    );
  }
};
