import { createTestDb, tables } from "@custodia/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createOwnerName: vi.fn(),
  loadEnsConfig: vi.fn(() => ({
    parentName: "custodia.eth",
    agentAddress: "0x1111111111111111111111111111111111111111",
  })),
  getUserLabel: vi.fn(async () => "alice"),
  getParentName: vi.fn(() => "custodia.eth"),
  makeOwnerName: vi.fn((label: string, parent: string) => `${label}.${parent}`),
}));
vi.mock("@custodia/ens", async (orig) => ({
  ...(await orig<object>()),
  createOwnerName: mocks.createOwnerName,
  loadEnsConfig: mocks.loadEnsConfig,
  getUserLabel: mocks.getUserLabel,
  getParentName: mocks.getParentName,
  makeOwnerName: mocks.makeOwnerName,
}));

import { ensAttachHandler } from "./ens-attach.js";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

const owner = "0x2222222222222222222222222222222222222222";
const job = {
  id: 1,
  kind: "ens.attach",
  payload: { wallet: owner, label: "alice" },
  dedupeKey: "ens.attach:owner",
  status: "leased" as const,
  attempts: 1,
  leasedBy: "w",
  leasedUntil: null,
  runAfter: new Date(),
  lastError: null,
  createdAt: new Date(),
  finishedAt: null,
};

it("writes identity records once and is a no-op when already attached", async () => {
  mocks.createOwnerName
    .mockResolvedValueOnce({
      name: "alice.custodia.eth",
      recordsTxId: "0xaa",
      created: true,
    })
    .mockResolvedValueOnce({
      name: "alice.custodia.eth",
      recordsTxId: null,
      created: false,
    });
  const run = () => ensAttachHandler({ db: ctx.db, job, heartbeat: async () => {} });
  await run();
  await run();
  expect(mocks.createOwnerName).toHaveBeenCalledTimes(2);
  expect(mocks.createOwnerName.mock.calls[0]?.[1]).toMatchObject({
    userLabel: "alice",
    owner,
    url: "/alice.custodia.eth",
  });
  const [user] = await ctx.db
    .select()
    .from(tables.users)
    .where(eq(tables.users.wallet, owner.toLowerCase()));
  expect(user?.ensLabel).toBe("alice");
  const receipts = await ctx.db.select().from(tables.receipts);
  expect(receipts).toHaveLength(1);
  expect(receipts[0]?.txId).toBe("0xaa");
});
