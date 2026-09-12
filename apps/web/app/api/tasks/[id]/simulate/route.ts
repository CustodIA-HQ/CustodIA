import "../../../../env";

import { createDb, tables } from "@custodia/db";
import { evaluate } from "@custodia/policy";
import { loadLatestMandate, loadTask } from "@custodia/runtime";
import type { Mandate, ProposedAction } from "@custodia/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionFrom } from "../../../session";

const BodySchema = z.object({
  fromAsset: z.string().default("ETH"),
  toAsset: z.string().default("USDC"),
  notionalUsd: z.number().positive().default(1),
});

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = sessionFrom(request);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const db = createDb();
  const task = await loadTask(db as never, id);
  if (!task || task.userWallet.toLowerCase() !== session.address.toLowerCase()) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  if (task.status !== "active") {
    return NextResponse.json({ error: `Task is ${task.status}, not active.` }, { status: 409 });
  }
  const mandateRow = await loadLatestMandate(db as never, id);
  if (!mandateRow) return NextResponse.json({ error: "No signed mandate." }, { status: 409 });
  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  const action: ProposedAction = {
    kind: "rebalance",
    fromAsset: parsed.success ? parsed.data.fromAsset : "ETH",
    toAsset: parsed.success ? parsed.data.toAsset : "USDC",
    notionalUsd: parsed.success ? parsed.data.notionalUsd : 1,
    reason: "User-triggered simulated rebalance",
  };
  const spentRows = await db.select().from(tables.receipts).where(eq(tables.receipts.taskId, id));
  const spentUsd = spentRows
    .filter((row) => row.kind === "simulated" && typeof (row.payload as { action?: { notionalUsd?: number } })?.action?.notionalUsd === "number")
    .reduce((sum, row) => sum + Number((row.payload as { action: { notionalUsd: number } }).action.notionalUsd), 0);
  const decision = evaluate(mandateRow.typedData as Mandate, action, {
    spentUsd,
    now: Math.floor(Date.now() / 1000),
  });
  const txId = `sim-${id}-${Date.now()}`;
  await db.insert(tables.receipts).values({
    taskId: id,
    kind: "simulated",
    txId,
    network: "eip155:11155111",
    amount: String(action.notionalUsd),
    payload: {
      simulated: true,
      label: "Simulated fill. No on-chain swap. TaskVault is not in this build.",
      decision,
      action,
    },
  });
  return NextResponse.json({ ok: true, simulated: true, txId, decision, action });
}
