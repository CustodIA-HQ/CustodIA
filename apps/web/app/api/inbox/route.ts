import "../../env";

import { createDb, tables } from "@custodia/db";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { sessionFrom } from "../session";

export const dynamic = "force-dynamic";

const channelOf = (conversationId: string): "telegram" | "whatsapp" | "web" =>
  conversationId.startsWith("telegram:")
    ? "telegram"
    : conversationId.startsWith("whatsapp:")
      ? "whatsapp"
      : "web";

/**
 * GET /api/inbox — the signed-in wallet's sessions across every channel and
 * its notifications (agent proposals, actions, refusals, task events), newest
 * first. Wallet-scoped: nothing here is readable without the session cookie.
 */
export async function GET(request: Request) {
  const session = sessionFrom(request);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const db = createDb();
  const owner = session.address;

  // Sessions: one row per conversation, with the last user message and run status.
  const runs = await db
    .select({
      conversationId: tables.runs.conversationId,
      status: tables.runs.status,
      input: tables.runs.input,
      output: tables.runs.output,
      createdAt: tables.runs.createdAt,
    })
    .from(tables.runs)
    .where(sql`lower(${tables.runs.ownerWallet}) = ${owner.toLowerCase()}`)
    .orderBy(desc(tables.runs.createdAt))
    .limit(200);
  const sessions = new Map<
    string,
    {
      id: string;
      channel: string;
      lastAt: string;
      lastMessage: string;
      lastReply: string;
      runs: number;
    }
  >();
  for (const run of runs) {
    const messages =
      (run.input as { messages?: Array<{ role: string; content: string }> }).messages ?? [];
    const lastUser = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const reply = (run.output as { rationale?: string } | null)?.rationale ?? "";
    const existing = sessions.get(run.conversationId);
    if (existing) {
      existing.runs += 1;
      continue;
    }
    sessions.set(run.conversationId, {
      id: run.conversationId,
      channel: channelOf(run.conversationId),
      lastAt: run.createdAt.toISOString(),
      lastMessage: lastUser.slice(0, 160),
      lastReply: reply.slice(0, 200),
      runs: 1,
    });
  }

  // Notifications: agent actions on the wallet's tasks + web outbox events.
  const taskRows = await db
    .select({ id: tables.tasks.id, ensName: tables.tasks.ensName })
    .from(tables.tasks)
    .where(sql`lower(${tables.tasks.userWallet}) = ${owner.toLowerCase()}`);
  const taskIds = taskRows.map((t) => t.id);
  const ensOf = new Map(taskRows.map((t) => [t.id, t.ensName]));
  const actions = taskIds.length
    ? await db
        .select()
        .from(tables.actions)
        .where(inArray(tables.actions.taskId, taskIds))
        .orderBy(desc(tables.actions.updatedAt))
        .limit(30)
    : [];
  const events = await db
    .select()
    .from(tables.outbox)
    .where(
      and(
        eq(tables.outbox.channel, "web"),
        sql`lower(${tables.outbox.target}) = ${owner.toLowerCase()}`,
      ),
    )
    .orderBy(desc(tables.outbox.createdAt))
    .limit(30);

  return NextResponse.json({
    wallet: owner,
    sessions: [...sessions.values()],
    actions: actions.map((a) => ({
      id: a.id,
      taskId: a.taskId,
      ensName: ensOf.get(a.taskId) ?? a.taskId,
      status: a.status,
      tokenIn: a.tokenIn,
      tokenOut: a.tokenOut,
      amountIn: a.amountIn,
      amountOut: a.amountOut,
      txHash: a.txHash,
      reason: a.reason,
      agent: a.reason?.startsWith("agent:") ?? false,
      at: a.updatedAt.toISOString(),
      pending: a.status === "proposed" && Date.now() - a.createdAt.getTime() < 30 * 60 * 1_000,
    })),
    events: events.map((e) => ({
      id: e.id,
      at: e.createdAt.toISOString(),
      payload: e.payload,
    })),
  });
}
