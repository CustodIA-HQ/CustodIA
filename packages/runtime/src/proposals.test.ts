import { createTestDb } from "@custodia/db";
import { afterAll, beforeAll, expect, it } from "vitest";
import { loadProposal, proposalHash, storeProposal } from "./proposals.js";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("hashes canonically (key order does not matter)", () => {
  expect(proposalHash({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(
    proposalHash({ a: [2, { c: 4, d: 3 }], b: 1 }),
  );
});

it("stores an immutable version and reloads it by id", async () => {
  const body = { market: { pair: "ETH/USDC" }, uiSpec: { version: 1 }, proposal: { taskId: "t1" } };
  const stored = await storeProposal(ctx.db, {
    runId: "r1",
    taskId: "t1",
    ownerWallet: "0xowner",
    body,
  });
  const loaded = await loadProposal(ctx.db, stored.proposalId);
  expect(loaded?.hash).toBe(proposalHash(body));
  expect(loaded?.body).toEqual(body);
  await expect(
    storeProposal(ctx.db, { runId: "r1", taskId: "t1", ownerWallet: "0xowner", body }),
  ).rejects.toThrow();
});
