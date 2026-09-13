import { randomBytes } from "node:crypto";
import { classifyIntent, runAgent } from "@custodia/agent";
import { PostgresMarketCache, tables } from "@custodia/db";
import { getParentName, makeTaskName } from "@custodia/ens";
import { templateForIntent } from "@custodia/schema";
import { eq } from "drizzle-orm";
import {
  findActiveTask,
  findExecutableTask,
  fundVaultUrl,
  parseOrder,
  queueOrder,
} from "../actions.js";
import { queueChannelReply } from "../channels.js";
import { storeProposal } from "../proposals.js";
import type { JobHandler } from "../registry.js";
import { appendEvent, completeRun, failRun, type RunStage } from "../runs.js";
import { getOrCreateUserLabel } from "../users.js";

const STAGE_FOR_TOOL: Record<string, RunStage> = {
  get_market_context: "fetching_context",
  paid_risk_request: "paying_analysis",
  emit_ui_spec: "generating_ui",
};

interface ChatRunInput {
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  agent: `0x${string}`;
}

/**
 * kind: chat.run — payload { runId }. Runs the agent once, streams stages and
 * tool events into run_events, opens the task in `draft`, and records the
 * immutable proposal the mandate route will bind authorization to.
 */
export const chatHandler: JobHandler = async (ctx) => {
  const { runId } = ctx.job.payload as { runId: string };
  // Only the delivery that finished the run answers the originating channel.
  if (await runChat(ctx, runId)) await queueChannelReply(ctx.db, runId);
};

/** Returns true when this call moved the run to done or failed. */
async function runChat(
  { db, heartbeat }: Parameters<JobHandler>[0],
  runId: string,
): Promise<boolean> {
  const [run] = await db.select().from(tables.runs).where(eq(tables.runs.id, runId)).limit(1);
  if (!run) throw new Error(`run ${runId} not found`);
  // Duplicate delivery or a retried job: an agent run is never repeated —
  // it costs money and is not idempotent.
  if (run.status === "done" || run.status === "failed") return false;
  await db.update(tables.runs).set({ status: "running" }).where(eq(tables.runs.id, runId));

  const input = run.input as ChatRunInput;
  const owner = run.ownerWallet as `0x${string}`;
  let stage: RunStage = "inspecting_wallet";
  // Events are appended sequentially so seq numbers never collide.
  let chain: Promise<unknown> = appendEvent(db, runId, { stage, type: "stage" });
  const record = (event: Parameters<typeof appendEvent>[2]) => {
    chain = chain.then(() => appendEvent(db, runId, event));
  };

  try {
    const lastUser = [...input.messages].reverse().find((message) => message.role === "user");
    const intent = classifyIntent(lastUser?.content ?? "");
    record({
      stage,
      type: "tool",
      payload: { type: "tool", name: "classify_intent", output: { intent } },
    });
    // A plain order on a funded task goes to the vault executor, not the model.
    if (intent === "execute") {
      const order = parseOrder(lastUser?.content ?? "");
      const task = order ? await findExecutableTask(db, owner) : null;
      if (order && task?.vault) {
        const actionId = await queueOrder(db, { taskId: task.id, vault: task.vault, runId, order });
        record({
          stage,
          type: "tool",
          payload: { type: "tool", name: "queue_order", output: { actionId } },
        });
        await chain;
        await completeRun(db, runId, {
          proposalId: null,
          proposalHash: null,
          ensName: task.ensName,
          taskId: null,
          rationale: `Checking your order against the boundary and submitting it: ${order.sell} → ${order.buy}, ${order.amount} ${order.exactOutput ? order.buy : order.sell}. You'll get the result with the transaction link.`,
          receipts: [],
        });
        return true;
      }
      if (order) {
        const active = await findActiveTask(db, owner);
        await chain;
        await completeRun(db, runId, {
          proposalId: null,
          proposalHash: null,
          ensName: active?.ensName ?? null,
          taskId: null,
          rationale: active
            ? `To execute for real, fund a vault for ${active.ensName} first: ${fundVaultUrl(active.id)}`
            : 'There is no active task yet. Ask for a guard first (for example "protect my ETH if it drops 15%"), sign it, then fund its vault.',
          receipts: [],
        });
        return true;
      }
    }
    if (intent === "unsupported") {
      await chain;
      await completeRun(db, runId, {
        proposalId: null,
        proposalHash: null,
        ensName: null,
        taskId: null,
        rationale:
          "That request is outside this testnet build. Mainnet, bridges, and unbounded execution are not available. Futures stay simulated and only inside a signed envelope.",
        receipts: [],
      });
      return true;
    }
    const result = await runAgent({
      messages: input.messages,
      owner,
      agent: input.agent,
      intent,
      cache: new PostgresMarketCache(db as never),
      onEvent: (event) => {
        const next = event.type === "tool" && event.name ? STAGE_FOR_TOOL[event.name] : undefined;
        if (next && next !== stage) {
          stage = next;
          record({ stage, type: "stage" });
        }
        record({ stage, type: event.type, payload: event });
        void heartbeat();
      },
    });
    await chain;

    // A run may legitimately end without a proposal (policy denied the paid
    // analysis, unsupported request, nothing to guard). That is a completed
    // run whose result is the explanation, not a failure.
    if (intent === "research" || intent === "holdings" || !result.uiSpec || !result.market) {
      await completeRun(db, runId, {
        proposalId: null,
        proposalHash: null,
        ensName: null,
        taskId: null,
        rationale: result.rationale,
        receipts: result.receipts,
      });
      return true;
    }

    const taskId = randomBytes(4).toString("hex");
    const userLabel = await getOrCreateUserLabel(db, owner);
    const parentName = getParentName();
    const ensName = makeTaskName(taskId, userLabel, parentName);
    const template =
      result.uiSpec.intent === "needs_human"
        ? "needs_human"
        : (templateForIntent(intent) ?? "portfolio_guard");
    const proposal = {
      taskId,
      userLabel,
      parentName,
      ensName,
      owner,
      agent: input.agent,
      template,
    };
    await db.insert(tables.tasks).values({
      id: taskId,
      userWallet: owner,
      ensName,
      template,
      status: "draft",
    });
    const { proposalId, hash } = await storeProposal(db, {
      runId,
      taskId,
      ownerWallet: owner,
      body: { market: result.market, uiSpec: result.uiSpec, proposal },
    });
    await appendEvent(db, runId, { stage: "awaiting_signature", type: "stage" });
    await completeRun(db, runId, {
      proposalId,
      proposalHash: hash,
      ensName,
      taskId,
      rationale: result.rationale,
      receipts: result.receipts,
    });
  } catch (err) {
    await chain.catch(() => undefined);
    // Record the failure on the run and let the job complete: retrying would
    // re-run the agent (and re-pay). Infrastructure errors before the agent
    // starts (run not found) still throw above and are retried.
    await failRun(db, runId, err instanceof Error ? err.message : String(err));
  }
  return true;
}
