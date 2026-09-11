import { createTestDb } from "@custodia/db";
import { afterAll, beforeAll, expect, it } from "vitest";
import { appendEvent, completeRun, createRun, listEvents, loadRun } from "./runs.js";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

const base = {
  conversationId: "c1",
  ownerWallet: "0xowner",
  kind: "chat" as const,
  input: { message: "hi" },
};

it("is idempotent on (conversation, clientRequestId)", async () => {
  const a = await createRun(ctx.db, { ...base, clientRequestId: "r1" });
  const b = await createRun(ctx.db, { ...base, clientRequestId: "r1" });
  expect(a.created).toBe(true);
  expect(b).toEqual({ runId: a.runId, created: false });
  expect((await loadRun(ctx.db, a.runId))?.status).toBe("queued");
});

it("appends ordered events and completes", async () => {
  const { runId } = await createRun(ctx.db, { ...base, clientRequestId: "r2" });
  await appendEvent(ctx.db, runId, { stage: "fetching_context", type: "stage" });
  await appendEvent(ctx.db, runId, {
    stage: "fetching_context",
    type: "text",
    payload: { delta: "hi" },
  });
  await completeRun(ctx.db, runId, { ok: true });
  const events = await listEvents(ctx.db, runId, 0);
  expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
  expect(events.at(-1)).toMatchObject({ stage: "done", type: "result" });
  expect(await listEvents(ctx.db, runId, 2)).toHaveLength(1);
  expect((await loadRun(ctx.db, runId))?.status).toBe("done");
});
