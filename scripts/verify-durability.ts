import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createDb, createPooledDb, tables } from "@custodia/db";
import { chatHandler, enqueueJob, HandlerRegistry, tick } from "@custodia/runtime";
import { and, eq, sql } from "drizzle-orm";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/**
 * pnpm verify:durability — the Stage 1 gate, against the running app (pnpm dev):
 *
 *  1. duplicate delivery: POST /api/chat twice with the same clientRequestId →
 *     one run, second response created:false, exactly one proposal row.
 *  2. crash recovery: a job whose worker "died" mid-lease (leased_until in the
 *     past) is re-leased by another worker and completed.
 *
 * Scenario 1 performs one real agent run (OpenAI + The Graph + 0.1 HBAR x402).
 */
const BASE = process.env.APP_URL ?? "http://localhost:3000";
const fail = (msg: string): never => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const j = async (res: Response) => res.json().catch(() => ({}));

// ── auth ─────────────────────────────────────────────────────────────────────
const user = privateKeyToAccount(generatePrivateKey());
const conversationId = randomUUID();
const challenge = (await j(
  await fetch(`${BASE}/api/auth/challenge`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: user.address, conversationId }),
  }),
)) as { message?: string; error?: string };
if (!challenge.message) fail(`challenge: ${challenge.error}`);
const signature = await user.signMessage({ message: challenge.message as string });
const verify = await fetch(`${BASE}/api/auth/verify`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    address: user.address,
    conversationId,
    message: challenge.message,
    signature,
  }),
});
const cookie = verify.headers.get("set-cookie")?.split(";")[0];
if (!verify.ok || !cookie) fail(`verify: HTTP ${verify.status}`);
console.log(`✓ session for ${user.address}`);

// ── 1. duplicate delivery ────────────────────────────────────────────────────
const clientRequestId = randomUUID();
const send = () =>
  fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: cookie as string },
    body: JSON.stringify({
      conversationId,
      clientRequestId,
      message: "Keep $10k in ETH/USDC, max 5% drawdown",
    }),
  });
const first = (await j(await send())) as { runId?: string; created?: boolean };
const second = (await j(await send())) as { runId?: string; created?: boolean };
const runId = first.runId ?? fail("first chat did not return a runId");
if (second.runId !== runId || second.created !== false)
  fail(`duplicate delivery created a second run: ${JSON.stringify(second)}`);
console.log(`✓ duplicate delivery → same run ${runId} (created:false)`);

console.log("  waiting for the worker to finish the run…");
let status = "queued";
let lastStage = "";
const deadline = Date.now() + 180_000;
while (Date.now() < deadline) {
  const body = (await j(
    await fetch(`${BASE}/api/runs/${runId}/events?after=0`, {
      headers: { cookie: cookie as string },
    }),
  )) as { status: string; events: Array<{ stage: string }> };
  status = body.status;
  const stage = body.events.at(-1)?.stage ?? "";
  if (stage !== lastStage) {
    lastStage = stage;
    console.log(`  stage: ${stage}`);
  }
  if (status === "done" || status === "failed") break;
  await new Promise((r) => setTimeout(r, 2000));
}
if (status !== "done") fail(`run ended with status ${status}`);
const db = createDb();
const proposals = await db.select().from(tables.proposals).where(eq(tables.proposals.runId, runId));
// The durability property is about runs and jobs, not the agent's decision: a
// funded wallet yields exactly one proposal; an empty wallet yields a completed
// run with an explanation and no proposal. Both are valid; two proposals never.
if (proposals.length > 1)
  fail(`expected at most one proposal for the run, found ${proposals.length}`);
console.log(
  proposals.length === 1
    ? `✓ run done; exactly one proposal (${proposals[0]?.hash})`
    : "✓ run done with an explanation and no proposal (wallet holds nothing to guard)",
);

// ── 2. crash recovery ────────────────────────────────────────────────────────
const pooled = createPooledDb();
const { jobId } = await enqueueJob(pooled, {
  kind: "chat.run",
  payload: { runId }, // already done → the handler is a no-op, which is what we want here
  dedupeKey: `durability:${randomUUID()}`,
});
await pooled
  .update(tables.jobs)
  .set({
    status: "leased",
    leasedBy: "dead-worker",
    leasedUntil: sql`now() - interval '1 second'`,
    attempts: 1,
  })
  .where(eq(tables.jobs.id, jobId));
const registry = new HandlerRegistry().register("chat.run", chatHandler);
const outcome = await tick(pooled, registry, "recovery-worker");
const [job] = await pooled
  .select({ status: tables.jobs.status, leasedBy: tables.jobs.leasedBy })
  .from(tables.jobs)
  .where(and(eq(tables.jobs.id, jobId), eq(tables.jobs.status, "done")));
if (outcome !== "ran" || !job)
  fail(`stale lease was not recovered (outcome=${outcome}, job=${JSON.stringify(job)})`);
console.log(
  `✓ stale lease stolen from dead-worker and completed by recovery-worker (job ${jobId})`,
);

console.log("\nverify:durability OK");
process.exit(0);
