import { tables } from "@custodia/db";
import {
  createTask,
  directoryUrl,
  loadEnsConfig,
  makeOwnerName,
  taskDirectoryPath,
} from "@custodia/ens";
import { type Mandate, type MarketContext, mandateDigest, type UISpec } from "@custodia/schema";
import { and, eq } from "drizzle-orm";
import { queueChannelMessageForRun } from "../channels.js";
import type { JobHandler } from "../registry.js";

const SEPOLIA = "eip155:11155111";

const chartPayload = (market: MarketContext, uiSpec: UISpec): string => {
  const chart = uiSpec.components.find((c) => c.type === "price_chart");
  return JSON.stringify({
    schema: "custodia.chart.1",
    source: "The Graph",
    pair: market.pair,
    range: chart?.type === "price_chart" ? chart.range : "24h",
    fetchedAt: market.fetchedAt,
    points: market.hourly,
  });
};

/**
 * kind: ens.publish — payload { taskId, mandateId, proposalId }.
 * Publishes the signed mandate to the task's ENS subname (records + scoped
 * agent role), records the transaction receipts, activates the task and
 * queues an outbox notification. Idempotent: an already-active task is a
 * no-op, so redelivery after a crash never publishes twice.
 */
export const ensPublishHandler: JobHandler = async ({ db, job }) => {
  const { taskId, mandateId, proposalId } = job.payload as {
    taskId: string;
    mandateId: number;
    proposalId: string;
  };
  const [task] = await db.select().from(tables.tasks).where(eq(tables.tasks.id, taskId)).limit(1);
  if (!task) throw new Error(`task ${taskId} not found`);
  if (task.status === "active") return;

  const [mandateRow] = await db
    .select()
    .from(tables.mandates)
    .where(and(eq(tables.mandates.id, mandateId), eq(tables.mandates.taskId, taskId)))
    .limit(1);
  const [proposal] = await db
    .select()
    .from(tables.proposals)
    .where(eq(tables.proposals.id, proposalId))
    .limit(1);
  if (!mandateRow || !proposal) throw new Error(`mandate or proposal missing for task ${taskId}`);
  const mandate = mandateRow.typedData as Mandate;
  const body = proposal.body as {
    market: MarketContext;
    uiSpec: UISpec;
    proposal: { userLabel: string };
  };

  const config = loadEnsConfig();
  const ownerName = makeOwnerName(body.proposal.userLabel, config.parentName);
  const created = await createTask(config, {
    userLabel: body.proposal.userLabel,
    taskId,
    mandateHash: mandateDigest(mandate),
    owner: mandate.owner,
    agent: mandate.agent,
    status: "active",
    chart: chartPayload(body.market, body.uiSpec),
    ui: JSON.stringify(body.uiSpec),
    url: directoryUrl(taskDirectoryPath(ownerName, taskId, task.template)),
  });

  await db.insert(tables.receipts).values([
    {
      taskId,
      kind: "ens_tx",
      txId: created.recordsTxId,
      network: SEPOLIA,
      payload: { step: "records" },
    },
    { taskId, kind: "ens_tx", txId: created.txId, network: SEPOLIA, payload: { step: "delegate" } },
  ]);
  await db.update(tables.tasks).set({ status: "active" }).where(eq(tables.tasks.id, taskId));
  await db.insert(tables.outbox).values({
    channel: "web",
    target: task.userWallet,
    payload: { type: "task.active", taskId, ensName: created.name },
  });
  // The chat that asked for the guard gets the ENS-named page: chart, limits and status.
  await queueChannelMessageForRun(
    db,
    proposal.runId,
    `${created.name} is live on ENS. Chart and status: ${directoryUrl(taskDirectoryPath(ownerName, taskId, task.template))}`,
  );
};
