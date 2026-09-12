import { tables } from "@custodia/db";
import { and, eq, sql } from "drizzle-orm";
import type { AnyDb } from "./runs.js";

export type Job = typeof tables.jobs.$inferSelect;

export const DEFAULT_LEASE_SECONDS = 60;
export const DEFAULT_MAX_ATTEMPTS = 5;

/** Enqueue; a live job (queued/leased) with the same dedupe key is returned instead. */
export async function enqueueJob(
  db: AnyDb,
  params: { kind: string; payload: unknown; dedupeKey?: string; runAfter?: Date },
): Promise<{ jobId: number; created: boolean }> {
  if (params.dedupeKey) {
    const [live] = await db
      .select({ id: tables.jobs.id })
      .from(tables.jobs)
      .where(
        and(
          eq(tables.jobs.dedupeKey, params.dedupeKey),
          sql`${tables.jobs.status} in ('queued','leased')`,
        ),
      )
      .limit(1);
    if (live) return { jobId: live.id, created: false };
  }
  const [row] = await db
    .insert(tables.jobs)
    .values({
      kind: params.kind,
      payload: params.payload as object,
      dedupeKey: params.dedupeKey,
      runAfter: params.runAfter ?? new Date(),
    })
    .returning({ id: tables.jobs.id });
  if (!row) throw new Error("enqueueJob returned no row");
  return { jobId: row.id, created: true };
}

/** Atomically claim one runnable job (SKIP LOCKED). Expired leases are stealable. */
export async function leaseJob(
  db: AnyDb,
  params: { workerId: string; leaseSeconds?: number; kinds?: string[] },
): Promise<Job | null> {
  const lease = params.leaseSeconds ?? DEFAULT_LEASE_SECONDS;
  const kindFilter = params.kinds?.length
    ? sql`and kind in (${sql.join(
        params.kinds.map((k) => sql`${k}`),
        sql`, `,
      )})`
    : sql``;
  const result = await db.execute(sql`
    update jobs set status = 'leased', leased_by = ${params.workerId},
      leased_until = now() + make_interval(secs => ${lease}), attempts = attempts + 1
    where id = (
      select id from jobs
      where (status = 'queued' or (status = 'leased' and leased_until < now()))
        and run_after <= now() ${kindFilter}
      order by id
      limit 1
      for update skip locked
    )
    returning id, kind, payload, dedupe_key, status, attempts, leased_by, leased_until,
      run_after, last_error, created_at, finished_at`);
  // Driver-shaped results: `{ rows }` on Neon, a plain array on PGlite.
  const rows = (Array.isArray(result) ? result : (result as { rows?: unknown[] }).rows) ?? [];
  const raw = rows[0] as Record<string, unknown> | undefined;
  if (!raw) return null;
  return {
    id: Number(raw.id),
    kind: String(raw.kind),
    payload: raw.payload,
    dedupeKey: (raw.dedupe_key as string | null) ?? null,
    status: String(raw.status),
    attempts: Number(raw.attempts),
    leasedBy: (raw.leased_by as string | null) ?? null,
    leasedUntil: raw.leased_until ? new Date(raw.leased_until as string) : null,
    runAfter: new Date(raw.run_after as string),
    lastError: (raw.last_error as string | null) ?? null,
    createdAt: new Date(raw.created_at as string),
    finishedAt: raw.finished_at ? new Date(raw.finished_at as string) : null,
  };
}

export const heartbeatJob = (
  db: AnyDb,
  jobId: number,
  workerId: string,
  leaseSeconds = DEFAULT_LEASE_SECONDS,
) =>
  db
    .update(tables.jobs)
    .set({ leasedUntil: sql`now() + make_interval(secs => ${leaseSeconds})` })
    .where(and(eq(tables.jobs.id, jobId), eq(tables.jobs.leasedBy, workerId)));

export const completeJob = (db: AnyDb, jobId: number, workerId: string) =>
  db
    .update(tables.jobs)
    .set({ status: "done", finishedAt: new Date(), leasedBy: null, leasedUntil: null })
    .where(and(eq(tables.jobs.id, jobId), eq(tables.jobs.leasedBy, workerId)));

/** Back off exponentially (capped at 60 s); after maxAttempts the job is terminally failed. */
export async function failJob(
  db: AnyDb,
  jobId: number,
  workerId: string,
  error: string,
  opts: { maxAttempts?: number } = {},
): Promise<void> {
  const max = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const [job] = await db
    .select({ attempts: tables.jobs.attempts })
    .from(tables.jobs)
    .where(eq(tables.jobs.id, jobId));
  const attempts = job?.attempts ?? max;
  const terminal = attempts >= max;
  const backoffS = Math.min(2 ** attempts, 60);
  await db
    .update(tables.jobs)
    .set({
      status: terminal ? "failed" : "queued",
      lastError: error.slice(0, 2000),
      leasedBy: null,
      leasedUntil: null,
      finishedAt: terminal ? new Date() : null,
      runAfter: sql`now() + make_interval(secs => ${backoffS})`,
    })
    .where(and(eq(tables.jobs.id, jobId), eq(tables.jobs.leasedBy, workerId)));
}
