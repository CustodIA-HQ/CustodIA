import { randomUUID } from "node:crypto";
import { tables } from "@custodia/db";
import { publicAppOrigin } from "@custodia/ens/paths";
import { DECIMALS, VAULT_ASSETS, type VaultAsset } from "@custodia/vault";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { parseUnits } from "viem";
import { enqueueJob } from "./jobs.js";
import type { AnyDb } from "./runs.js";

/** A chat order the worker can execute: "swap 0.01 eth to usdc", "sell 0.02 ETH", "buy 0.01 eth with usdc". */
export interface Order {
  sell: VaultAsset;
  buy: VaultAsset;
  /** Of the sold asset, or of the bought asset when `exactOutput` is set ("buy 0.01 ETH"). */
  amount: number;
  exactOutput?: boolean;
}

const ASSET = /(eth|ether|usdc|usd)/i;
const norm = (s: string): VaultAsset => (/^usd/i.test(s) ? "USDC" : "ETH");

/**
 * Deterministic parser — the model never decides amounts or direction.
 * Returns null unless the message is unmistakably an order.
 */
export const parseOrder = (message: string): Order | null => {
  const text = message.trim();
  // swap|sell|convert <amount> <asset> [to|for|into <asset>]
  let m = text.match(
    new RegExp(
      `\\b(swap|sell|convert|vende|cambia)\\s+([0-9]*\\.?[0-9]+)\\s*${ASSET.source}(?:\\s+(?:to|for|into|a|por)\\s+${ASSET.source})?`,
      "i",
    ),
  );
  if (m?.[2] && m[3]) {
    const sell = norm(m[3]);
    const buy = m[4] ? norm(m[4]) : sell === "ETH" ? "USDC" : "ETH";
    return sell === buy ? null : { sell, buy, amount: Number(m[2]) };
  }
  // buy <amount> <asset> [with <asset>] — amount is of the asset bought; only ETH-with-USDC is priced here
  m = text.match(
    new RegExp(
      `\\b(buy|compra)\\s+([0-9]*\\.?[0-9]+)\\s*${ASSET.source}(?:\\s+(?:with|using|con)\\s+${ASSET.source})?`,
      "i",
    ),
  );
  if (m?.[2] && m[3]) {
    const buy = norm(m[3]);
    const sell = buy === "ETH" ? "USDC" : "ETH";
    // "buy 0.01 ETH": the input (USDC) is sized from the quote at execution time.
    return { sell, buy, amount: Number(m[2]), exactOutput: true };
  }
  return null;
};

/** The owner's most recent active task that has a vault, or null. */
export const findExecutableTask = async (db: AnyDb, ownerWallet: string) => {
  const [task] = await db
    .select()
    .from(tables.tasks)
    .where(
      and(
        eq(tables.tasks.userWallet, ownerWallet),
        eq(tables.tasks.status, "active"),
        isNotNull(tables.tasks.vault),
      ),
    )
    .orderBy(desc(tables.tasks.createdAt))
    .limit(1);
  return task ?? null;
};

/** The owner's most recent active task (with or without a vault), for the "fund first" hint. */
export const findActiveTask = async (db: AnyDb, ownerWallet: string) => {
  const [task] = await db
    .select()
    .from(tables.tasks)
    .where(and(eq(tables.tasks.userWallet, ownerWallet), eq(tables.tasks.status, "active")))
    .orderBy(desc(tables.tasks.createdAt))
    .limit(1);
  return task ?? null;
};

export const tokenOf = (asset: VaultAsset) => VAULT_ASSETS[asset];

/**
 * Persist the order as a previewed action and queue its execution. Amount is
 * of the sold asset in raw units; a "buy X ETH" order stores the wanted output
 * and lets the executor size the input from the quote.
 */
export async function queueOrder(
  db: AnyDb,
  params: { taskId: string; vault: string; runId: string | null; order: Order; reason?: string },
): Promise<string> {
  const { order } = params;
  const buyAmount = order.exactOutput === true;
  const id = randomUUID();
  await db.insert(tables.actions).values({
    id,
    taskId: params.taskId,
    runId: params.runId,
    vault: params.vault,
    tokenIn: tokenOf(order.sell),
    tokenOut: tokenOf(order.buy),
    amountIn: buyAmount
      ? "0"
      : parseUnits(order.amount.toString(), DECIMALS[order.sell]).toString(),
    minOut: buyAmount ? parseUnits(order.amount.toString(), DECIMALS[order.buy]).toString() : null,
    status: "previewed",
    reason: params.reason ?? (buyAmount ? "exact-output order: input sized from the quote" : null),
  });
  await enqueueJob(db, {
    kind: "execute",
    payload: { actionId: id },
    // One action at a time per vault: the nonce is sequential on-chain.
    dedupeKey: `execute:${params.vault}`,
  });
  return id;
}

export const fundVaultUrl = (taskId: string, origin = publicAppOrigin()): string =>
  `${origin}/task/${encodeURIComponent(taskId)}#vault`;

/** How long an agent proposal waits for the owner's YES. */
export const PROPOSAL_TTL_S = 30 * 60;

/** Persist an agent proposal that needs the owner's YES before it becomes an order. */
export async function proposeOrder(
  db: AnyDb,
  params: { taskId: string; vault: string; order: Order; reason: string },
): Promise<string> {
  const { order } = params;
  const id = randomUUID();
  await db.insert(tables.actions).values({
    id,
    taskId: params.taskId,
    vault: params.vault,
    runId: null,
    tokenIn: tokenOf(order.sell),
    tokenOut: tokenOf(order.buy),
    amountIn: order.exactOutput
      ? "0"
      : parseUnits(order.amount.toString(), DECIMALS[order.sell]).toString(),
    minOut: order.exactOutput
      ? parseUnits(order.amount.toString(), DECIMALS[order.buy]).toString()
      : null,
    status: "proposed",
    reason: params.reason,
  });
  return id;
}

/** The owner's open (unexpired) proposal, if any. */
export async function findOpenProposal(db: AnyDb, ownerWallet: string) {
  const rows = await db
    .select({ action: tables.actions, task: tables.tasks })
    .from(tables.actions)
    .innerJoin(tables.tasks, eq(tables.actions.taskId, tables.tasks.id))
    .where(and(eq(tables.tasks.userWallet, ownerWallet), eq(tables.actions.status, "proposed")))
    .orderBy(desc(tables.actions.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (Date.now() - row.action.createdAt.getTime() > PROPOSAL_TTL_S * 1_000) {
    await db
      .update(tables.actions)
      .set({ status: "expired", updatedAt: new Date() })
      .where(eq(tables.actions.id, row.action.id));
    return null;
  }
  return row;
}

/** "yes" / "no" (and a few synonyms) — the only words that resolve a proposal. */
export const parseConfirmation = (message: string): "yes" | "no" | null => {
  const t = message.trim().toLowerCase();
  if (/^(yes|y|si|sí|confirm|confirmo|ok|go|do it)(?![a-z])/.test(t)) return "yes";
  if (/^(no|n|cancel|cancela|skip|stop)(?![a-z])/.test(t)) return "no";
  return null;
};

/** YES turns the proposal into an order bound to this chat run; NO declines it. */
export async function resolveProposal(
  db: AnyDb,
  actionId: string,
  answer: "yes" | "no",
  /** The chat run that answered; null from the web inbox (the result then goes to every paired chat). */
  runId: string | null,
): Promise<void> {
  if (answer === "no") {
    await db
      .update(tables.actions)
      .set({ status: "declined", updatedAt: new Date() })
      .where(eq(tables.actions.id, actionId));
    return;
  }
  const [row] = await db.select().from(tables.actions).where(eq(tables.actions.id, actionId));
  if (!row) return;
  await db
    .update(tables.actions)
    .set({ status: "previewed", runId, updatedAt: new Date() })
    .where(eq(tables.actions.id, actionId));
  await enqueueJob(db, {
    kind: "execute",
    payload: { actionId },
    dedupeKey: `execute:${row.vault}`,
  });
}
