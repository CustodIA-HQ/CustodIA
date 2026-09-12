import { createTestDb } from "@custodia/db";
import { afterAll, beforeAll, expect, it } from "vitest";
import { completeJob, enqueueJob, failJob, leaseJob } from "./jobs.js";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("dedupes live jobs and leases exactly once", async () => {
  const a = await enqueueJob(ctx.db, {
    kind: "chat.run",
    payload: { runId: "r1" },
    dedupeKey: "chat.run:r1",
  });
  const b = await enqueueJob(ctx.db, {
    kind: "chat.run",
    payload: { runId: "r1" },
    dedupeKey: "chat.run:r1",
  });
  expect(a.created).toBe(true);
  expect(b).toEqual({ jobId: a.jobId, created: false });
  const first = await leaseJob(ctx.db, { workerId: "w1" });
  const second = await leaseJob(ctx.db, { workerId: "w2" });
  expect(first?.id).toBe(a.jobId);
  expect(second).toBeNull();
  await completeJob(ctx.db, a.jobId, "w1");
  expect(await leaseJob(ctx.db, { workerId: "w1" })).toBeNull();
});

it("re-leases after the lease expires and backs off on failure", async () => {
  const { jobId } = await enqueueJob(ctx.db, {
    kind: "ens.publish",
    payload: {},
    dedupeKey: "ens.publish:t1",
  });
  const leased = await leaseJob(ctx.db, { workerId: "w1", leaseSeconds: -1 }); // already expired
  expect(leased?.id).toBe(jobId);
  const again = await leaseJob(ctx.db, { workerId: "w2" });
  expect(again?.id).toBe(jobId); // an expired lease is stealable
  await failJob(ctx.db, jobId, "w2", "boom");
  const notYet = await leaseJob(ctx.db, { workerId: "w3" });
  expect(notYet).toBeNull(); // run_after is in the future
});
