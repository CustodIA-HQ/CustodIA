import { randomBytes } from "node:crypto";
import { runAgent } from "@custodia/agent";
import { PostgresMarketCache, tables } from "@custodia/db";
import { getParentName, getUserLabel, makeTaskName } from "@custodia/ens";
import { eq } from "drizzle-orm";
import { storeProposal } from "../proposals.js";
import type { JobHandler } from "../registry.js";
import { appendEvent, completeRun, failRun, type RunStage } from "../runs.js";

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
export const chatHandler: JobHandler = async ({ db, job, heartbeat }) => {
  const { runId } = job.payload as { runId: string };
  const [run] = await db.select().from(tables.runs).where(eq(tables.runs.id, runId)).limit(1);
  if (!run) throw new Error(`run ${runId} not found`);
  // Duplicate delivery or a retried job: an agent run is never repeated —
  // it costs money and is not idempotent.
  if (run.status === "done" || run.status === "failed") return;
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
    const result = await runAgent({
      messages: input.messages,
      owner,
      agent: input.agent,
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
    if (!result.uiSpec || !result.market) {
      await completeRun(db, runId, {
        proposalId: null,
        proposalHash: null,
        ensName: null,
        taskId: null,
        rationale: result.rationale,
        receipts: result.receipts,
      });
      return;
    }

    const taskId = randomBytes(4).toString("hex");
    const userLabel = await getUserLabel(owner);
    const parentName = getParentName();
    const ensName = makeTaskName(taskId, userLabel, parentName);
    const proposal = { taskId, userLabel, parentName, ensName, owner, agent: input.agent };
    await db.insert(tables.tasks).values({
      id: taskId,
      userWallet: owner,
      ensName,
      template: "portfolio_guard",
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
};
