import { PostgresMarketCache, tables } from "@custodia/db";
import { getMarketContext } from "@custodia/graph";
import type { Mandate, UISpec } from "@custodia/schema";
import { readVault, type VaultState } from "@custodia/vault";
import { desc, eq } from "drizzle-orm";
import { createPublicClient, formatUnits, http } from "viem";
import { sepolia } from "viem/chains";
import { type Order, proposeOrder, queueOrder } from "../actions.js";
import { notifyOwner } from "../channels.js";
import type { JobHandler } from "../registry.js";
import { loadLatestMandate, loadLatestProposal, transitionTask } from "../tasks.js";

/** Rebalance only when the ETH share drifts this far from the signed target. */
export const REBALANCE_TOLERANCE_PCT = 5;
/** At most one agent-initiated action or proposal per task in this window. */
export const AUTONOMY_MIN_GAP_S = 10 * 60;
/** Ignore dust: no autonomous order below this size. */
const MIN_ORDER_USD = 1;

export interface AutonomyInput {
  mandate: Mandate;
  /** Signed target ETH share (0–100) from the proposal's allocation selector, if any. */
  targetEthPct: number | null;
  vault: Pick<VaultState, "weth" | "usdc" | "caps">;
  priceUsd: number;
  highWaterUsd: number | null;
}

export interface AutonomyDecision {
  order: Order | null;
  /** `execute`: the signed emergency rule — acts on its own. `confirm`: needs a YES in the chat. */
  mode: "execute" | "confirm" | null;
  reason: string;
  equityUsd: number;
  highWaterUsd: number;
}

const find = <T extends Mandate["constraints"][number]["type"]>(mandate: Mandate, type: T) =>
  mandate.constraints.find((c) => c.type === type) as
    | Extract<Mandate["constraints"][number], { type: T }>
    | undefined;

const round = (value: number, digits: number) => Number(value.toFixed(digits));

/**
 * The agent's own decision, from the signed boundary and nothing else. Pure.
 *
 *   1. Drawdown guard — value fell more than max_drawdown_pct from the high-water
 *      mark: move ETH to USDC, one per-trade cap at a time. This is the
 *      protection the owner signed for, so it executes without asking.
 *   2. Rebalance — allowed and the ETH share drifted past the tolerance: propose
 *      the trade back toward the target and wait for the owner's YES.
 *   3. Otherwise do nothing — always a valid outcome.
 */
export const decideAutonomy = (input: AutonomyInput): AutonomyDecision => {
  const eth = Number(formatUnits(input.vault.weth, 18));
  const usdc = Number(formatUnits(input.vault.usdc, 6));
  const ethUsd = eth * input.priceUsd;
  const equityUsd = ethUsd + usdc;
  const highWaterUsd = Math.max(input.highWaterUsd ?? 0, equityUsd);
  const nothing = (reason: string): AutonomyDecision => ({
    order: null,
    mode: null,
    reason,
    equityUsd,
    highWaterUsd,
  });
  if (equityUsd < MIN_ORDER_USD) return nothing("vault is empty");

  const maxTradeEth = Number(formatUnits(input.vault.caps.weth.maxTrade, 18));
  const maxTradeUsdc = Number(formatUnits(input.vault.caps.usdc.maxTrade, 6));

  const drawdown = find(input.mandate, "custodia.max_drawdown_pct.1");
  if (drawdown && highWaterUsd > 0) {
    const drawdownPct = ((highWaterUsd - equityUsd) / highWaterUsd) * 100;
    if (drawdownPct >= drawdown.value && eth > 0) {
      const amount = Math.min(eth, maxTradeEth);
      if (amount * input.priceUsd >= MIN_ORDER_USD) {
        return {
          order: { sell: "ETH", buy: "USDC", amount: round(amount, 6) },
          mode: "execute",
          reason: `drawdown guard: vault value $${equityUsd.toFixed(2)} is ${drawdownPct.toFixed(1)}% below its high of $${highWaterUsd.toFixed(2)} (limit ${drawdown.value}%) — moving ETH to USDC`,
          equityUsd,
          highWaterUsd,
        };
      }
    }
  }

  const allowRebalance = find(input.mandate, "custodia.allow_rebalance.1")?.value === true;
  if (allowRebalance && input.targetEthPct !== null) {
    const ethPct = (ethUsd / equityUsd) * 100;
    const drift = ethPct - input.targetEthPct;
    if (Math.abs(drift) > REBALANCE_TOLERANCE_PCT) {
      const deltaUsd = (Math.abs(drift) / 100) * equityUsd;
      const summary = `rebalance: ETH is ${ethPct.toFixed(1)}% of the vault, target ${input.targetEthPct}%`;
      if (drift > 0) {
        const amount = Math.min(deltaUsd / input.priceUsd, maxTradeEth);
        if (amount * input.priceUsd >= MIN_ORDER_USD) {
          return {
            order: { sell: "ETH", buy: "USDC", amount: round(amount, 6) },
            mode: "confirm",
            reason: `${summary} — sell ETH`,
            equityUsd,
            highWaterUsd,
          };
        }
      } else {
        const amount = Math.min(deltaUsd, usdc, maxTradeUsdc);
        if (amount >= MIN_ORDER_USD) {
          return {
            order: { sell: "USDC", buy: "ETH", amount: round(amount, 2) },
            mode: "confirm",
            reason: `${summary} — buy ETH`,
            equityUsd,
            highWaterUsd,
          };
        }
      }
    }
  }
  return nothing("inside the boundary, nothing to do");
};

export const targetFromProposal = (body: unknown): number | null => {
  const spec = (body as { uiSpec?: UISpec } | null)?.uiSpec;
  const allocation = spec?.components.find((c) => c.type === "allocation_selector");
  if (allocation?.type !== "allocation_selector") return null;
  const ethIndex = allocation.assets.indexOf("ETH");
  return ethIndex >= 0 ? (allocation.defaultPct[ethIndex] ?? null) : null;
};

/**
 * kind: monitor.active — the watch loop (the worker enqueues it every minute).
 * Expires mandates past `exp`; for every active task with a funded vault,
 * decides from the signed boundary whether to act: a drawdown-guard sale is
 * queued straight to the executor (same policy, quote, approval and on-chain
 * checks as a chat order); a rebalance is proposed to the owner's chats and
 * waits for YES. At most one per task per AUTONOMY_MIN_GAP_S.
 */
export const monitorHandler: JobHandler = async ({ db }) => {
  const active = await db.select().from(tables.tasks).where(eq(tables.tasks.status, "active"));
  const now = Math.floor(Date.now() / 1000);
  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL),
  });
  for (const task of active) {
    const mandateRow = await loadLatestMandate(db, task.id);
    if (!mandateRow) continue;
    const mandate = mandateRow.typedData as Mandate;
    if (now > mandate.exp) {
      await transitionTask(db, task.id, "expired", "system");
      continue;
    }
    if (!task.vault) continue;
    try {
      const vault = await readVault(client, task.vault as `0x${string}`);
      if (!vault.active || now > vault.expiry) continue;
      // One thing at a time per task: nothing while an action is in flight or a proposal is open.
      const [recent] = await db
        .select()
        .from(tables.actions)
        .where(eq(tables.actions.taskId, task.id))
        .orderBy(desc(tables.actions.createdAt))
        .limit(1);
      if (recent && ["previewed", "approved", "submitted", "proposed"].includes(recent.status)) {
        continue;
      }
      if (
        recent?.reason?.startsWith("agent:") &&
        now - recent.createdAt.getTime() / 1000 < AUTONOMY_MIN_GAP_S
      ) {
        continue;
      }
      const market = await getMarketContext("ETH/USDC", {
        cache: new PostgresMarketCache(db as never),
      });
      const proposal = await loadLatestProposal(db, task.id);
      const decision = decideAutonomy({
        mandate,
        targetEthPct: proposal ? targetFromProposal(proposal.body) : null,
        vault,
        priceUsd: market.priceUsd,
        highWaterUsd: task.highWaterUsd ? Number(task.highWaterUsd) : null,
      });
      if (decision.highWaterUsd !== Number(task.highWaterUsd ?? 0)) {
        await db
          .update(tables.tasks)
          .set({ highWaterUsd: decision.highWaterUsd.toFixed(2) })
          .where(eq(tables.tasks.id, task.id));
      }
      if (!decision.order) continue;
      const reason = `agent: ${decision.reason}`;
      if (decision.mode === "execute") {
        await queueOrder(db, {
          taskId: task.id,
          vault: task.vault,
          runId: null,
          order: decision.order,
          reason,
        });
      } else {
        const proposalId = await proposeOrder(db, {
          taskId: task.id,
          vault: task.vault,
          order: decision.order,
          reason,
        });
        // Web chat sees proposals through the outbox too; the chats get the text below.
        await db.insert(tables.outbox).values({
          channel: "web",
          target: task.userWallet,
          payload: {
            type: "action.proposed",
            taskId: task.id,
            actionId: proposalId,
            reason: decision.reason,
          },
        });
        const o = decision.order;
        await notifyOwner(
          db,
          task.userWallet,
          `Agent proposal — ${decision.reason}.\n\nReply YES to swap ${o.amount} ${o.sell} → ${o.buy} inside your limits, or NO to skip. The proposal expires in 30 minutes.`,
        );
      }
    } catch (error) {
      // One task's RPC trouble must not stop the others; the next tick retries.
      console.error(`[monitor] ${task.id}: ${error instanceof Error ? error.message : error}`);
    }
  }
};
