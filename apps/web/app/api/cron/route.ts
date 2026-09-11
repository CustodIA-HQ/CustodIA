import "../../env";

import { createDb, tables } from "@custodia/db";
import { loadEnsConfig, setStatus } from "@custodia/ens";
import { getMarketContext, MARKET_CACHE_TTL_S } from "@custodia/graph";
import { evaluatePolicyLimits } from "@custodia/policy";
import { MandateSchema } from "@custodia/schema";
import { and, asc, desc, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";

const { cursors, mandates, receipts, tasks } = tables;

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Max tasks per cron invocation. Keeps each run inside Vercel's 10-second
 * serverless timeout even under load; remaining tasks are handled next tick.
 */
const PAGE_SIZE = 10;

/** Row identifier in the `cursors` table. */
const WATCHER_CURSOR = "watcher";

// ─── Outcome type ─────────────────────────────────────────────────────────────

interface TaskOutcome {
  taskId: string;
  status: "ok" | "violated" | "error";
  reason?: string;
  txId?: string;
}

// ─── GET handler ──────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  // 1. Auth — Vercel injects CRON_SECRET as a Bearer token on every scheduled call.
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Guard: require DATABASE_URL — hard 501 when Neon is not configured.
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "Watcher processing is not implemented" },
      { status: 501 },
    );
  }

  try {
    const db = createDb();

    // 3. Read the persistent cursor — picks up where the last run stopped.
    const [cursorRow] = await db
      .select()
      .from(cursors)
      .where(eq(cursors.id, WATCHER_CURSOR))
      .limit(1);
    const afterId = cursorRow?.lastProcessedId ?? null;

    // 4. Paginate active tasks ordered by primary key (deterministic, resumable).
    //    gt(tasks.id, afterId) is the cursor predicate; skipped on the first run.
    const activeTasks = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, "active"),
          ...(afterId !== null ? [gt(tasks.id, afterId)] : []),
        ),
      )
      .orderBy(asc(tasks.id))
      .limit(PAGE_SIZE);

    // 5. Queue drained — reset cursor so next invocation starts from the top.
    if (activeTasks.length === 0) {
      await db
        .insert(cursors)
        .values({ id: WATCHER_CURSOR, lastProcessedId: null, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: cursors.id,
          set: { lastProcessedId: null, updatedAt: new Date() },
        });
      return NextResponse.json({ processed: 0, cursor: null, reset: true });
    }

    // 6. Fetch live market context ONCE — shared by all tasks on this page.
    //    An error here is fatal: the cursor is NOT advanced so tasks retry next tick.
    const ensConfig = loadEnsConfig();
    const market = await getMarketContext("ETH/USDC", { ttlS: MARKET_CACHE_TTL_S });
    const now = Math.floor(Date.now() / 1_000);

    const outcomes: TaskOutcome[] = [];

    // 7. Process each task independently — one try/catch per record.
    for (const task of activeTasks) {
      const outcome = await processTask({ task, db, market, now, ensConfig });
      outcomes.push(outcome);
    }

    // 8. Advance cursor to the last task processed in this page.
    const lastId = activeTasks[activeTasks.length - 1]!.id;
    await db
      .insert(cursors)
      .values({ id: WATCHER_CURSOR, lastProcessedId: lastId, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: cursors.id,
        set: { lastProcessedId: lastId, updatedAt: new Date() },
      });

    return NextResponse.json({ processed: activeTasks.length, cursor: lastId, outcomes });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Watcher run failed";
    console.error(`[cron/watcher] fatal: ${message}`);
    const status = message.startsWith("Not implemented:") ? 501 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

// ─── Per-task processor ───────────────────────────────────────────────────────

async function processTask({
  task,
  db,
  market,
  now,
  ensConfig,
}: {
  task: typeof tasks.$inferSelect;
  // db: Db from @custodia/db (ReturnType<typeof createDb>)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  market: Awaited<ReturnType<typeof getMarketContext>>;
  now: number;
  ensConfig: ReturnType<typeof loadEnsConfig>;
}): Promise<TaskOutcome> {
  try {
    // 7a. Fetch the mandate with the highest version for this task.
    const [mandateRow] = await db
      .select()
      .from(mandates)
      .where(eq(mandates.taskId, task.id))
      .orderBy(desc(mandates.version))
      .limit(1);

    if (!mandateRow) {
      return { taskId: task.id, status: "ok", reason: "No mandate on record — skipped" };
    }

    // 7b. Validate the stored typed_data JSON against MandateSchema.
    //     A corrupt row must NEVER reach the policy engine.
    const parsed = MandateSchema.safeParse(mandateRow.typedData);
    if (!parsed.success) {
      return {
        taskId: task.id,
        status: "error",
        reason: `Mandate JSON failed schema validation: ${parsed.error.message}`,
      };
    }
    const mandate = parsed.data;

    // 7c. Expired mandate — skip silently; the human re-signs to reactivate.
    if (now > mandate.exp) {
      return {
        taskId: task.id,
        status: "ok",
        reason: `Mandate expired at ${mandate.exp} (now ${now}) — skipped`,
      };
    }

    // 7d. Inject live market data into the pure policy engine — zero I/O.
    const decision = evaluatePolicyLimits(mandate, { market, now });

    if (decision.allowed) {
      return { taskId: task.id, status: "ok", reason: decision.reason };
    }

    // 7e. VIOLATION — write "needs-human" to the ENSv2 xyz.custodia.status record.
    //     Only the agentKey is authorised to write this key per authorizeTextRoles.
    console.warn(
      `[cron/watcher] VIOLATED task=${task.id} constraint=${decision.violated ?? "?"} reason=${decision.reason}`,
    );

    const { txId } = await setStatus(ensConfig, task.ensName, "needs-human");

    // 7f. Mirror the status change locally so the DB stays consistent with ENS.
    await db.update(tasks).set({ status: "needs-human" }).where(eq(tasks.id, task.id));

    // 7g. Persist an ENS receipt for the audit trail.
    await db.insert(receipts).values({
      taskId: task.id,
      kind: "ens_tx",
      txId,
      network: "sepolia",
      payload: {
        action: "setStatus",
        newStatus: "needs-human",
        violated: decision.violated ?? null,
        reason: decision.reason,
        marketBlock: market.block,
        marketFetchedAt: market.fetchedAt,
      },
    });

    return { taskId: task.id, status: "violated", reason: decision.reason, txId };
  } catch (err) {
    // One task failure MUST NOT abort the rest of the queue.
    const message = err instanceof Error ? err.message : "Unknown processing error";
    console.error(`[cron/watcher] task=${task.id} error: ${message}`);
    return { taskId: task.id, status: "error", reason: message };
  }
}
