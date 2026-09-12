import { randomUUID } from "node:crypto";
import { tables } from "@custodia/db";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

/** Any drizzle Postgres database over our schema (Neon HTTP, Neon Pool, PGlite). */
export type AnyDb = PgDatabase<PgQueryResultHKT, typeof tables>;

export type RunStage =
  | "queued"
  | "inspecting_wallet"
  | "fetching_context"
  | "paying_analysis"
  | "generating_ui"
  | "awaiting_signature"
  | "publishing"
  | "done"
  | "failed";

export type RunEventType = "text" | "tool" | "stage" | "result" | "error";

/** Idempotent on (conversationId, clientRequestId): duplicate delivery returns the first run. */
export async function createRun(
  db: AnyDb,
  params: {
    conversationId: string;
    ownerWallet: string;
    kind: "chat";
    clientRequestId: string;
    input: unknown;
  },
): Promise<{ runId: string; created: boolean }> {
  const id = randomUUID();
  const inserted = await db
    .insert(tables.runs)
    .values({ id, ...params, input: params.input as object })
    .onConflictDoNothing({ target: [tables.runs.conversationId, tables.runs.clientRequestId] })
    .returning({ id: tables.runs.id });
  if (inserted.length === 1) return { runId: id, created: true };
  const [existing] = await db
    .select({ id: tables.runs.id })
    .from(tables.runs)
    .where(
      and(
        eq(tables.runs.conversationId, params.conversationId),
        eq(tables.runs.clientRequestId, params.clientRequestId),
      ),
    );
  if (!existing) throw new Error("run vanished between insert and select");
  return { runId: existing.id, created: false };
}

export const loadRun = async (db: AnyDb, runId: string) =>
  (await db.select().from(tables.runs).where(eq(tables.runs.id, runId)).limit(1))[0] ?? null;

/** Appends with the next sequence number for the run (unique per run). */
export async function appendEvent(
  db: AnyDb,
  runId: string,
  event: { stage: RunStage; type: RunEventType; payload?: unknown },
): Promise<{ seq: number }> {
  const [row] = await db
    .insert(tables.runEvents)
    .values({
      runId,
      seq: sql<number>`(select coalesce(max(${tables.runEvents.seq}), 0) + 1 from ${tables.runEvents} where ${tables.runEvents.runId} = ${runId})`,
      stage: event.stage,
      type: event.type,
      payload: event.payload as object | undefined,
    })
    .returning({ seq: tables.runEvents.seq });
  if (!row) throw new Error("appendEvent returned no row");
  return { seq: row.seq };
}

export const listEvents = (db: AnyDb, runId: string, afterSeq = 0) =>
  db
    .select({
      seq: tables.runEvents.seq,
      stage: tables.runEvents.stage,
      type: tables.runEvents.type,
      payload: tables.runEvents.payload,
      createdAt: tables.runEvents.createdAt,
    })
    .from(tables.runEvents)
    .where(and(eq(tables.runEvents.runId, runId), gt(tables.runEvents.seq, afterSeq)))
    .orderBy(asc(tables.runEvents.seq));

export async function completeRun(db: AnyDb, runId: string, output: unknown): Promise<void> {
  await db
    .update(tables.runs)
    .set({ status: "done", output: output as object, finishedAt: new Date() })
    .where(eq(tables.runs.id, runId));
  await appendEvent(db, runId, { stage: "done", type: "result", payload: output });
}

export async function failRun(db: AnyDb, runId: string, error: string): Promise<void> {
  await db
    .update(tables.runs)
    .set({ status: "failed", error, finishedAt: new Date() })
    .where(eq(tables.runs.id, runId));
  await appendEvent(db, runId, { stage: "failed", type: "error", payload: { error } });
}
