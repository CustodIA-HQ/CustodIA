import { afterAll, beforeAll, expect, it } from "vitest";
import { PostgresChallengeStore } from "./challenge-store.js";
import { createTestDb } from "./test/pglite.js";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("consumes a nonce exactly once", async () => {
  const store = new PostgresChallengeStore(ctx.db);
  const meta = { conversationId: "c1", address: "0xabc" };
  expect(await store.consume("n1", meta)).toBe(true);
  expect(await store.consume("n1", meta)).toBe(false);
  expect(await store.consume("n2", meta)).toBe(true);
});
