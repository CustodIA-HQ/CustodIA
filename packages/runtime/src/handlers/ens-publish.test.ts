import { createTestDb, tables } from "@custodia/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  loadEnsConfig: vi.fn(() => ({ parentName: "custodia.eth", agentAddress: "0xagent" })),
}));
vi.mock("@custodia/ens", async (orig) => ({
  ...(await orig<object>()),
  createTask: mocks.createTask,
  loadEnsConfig: mocks.loadEnsConfig,
}));

import { ensPublishHandler } from "./ens-publish.js";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

const owner = "0x2222222222222222222222222222222222222222";
const agent = "0x1111111111111111111111111111111111111111";
const market = {
  pair: "ETH/USDC",
  priceUsd: 2500,
  realizedVol24hPct: 2,
  tvlUsd: 1,
  hourly: [],
  block: 1,
  fetchedAt: 1,
};
const uiSpec = {
  intent: "configure_portfolio_guard",
  components: [{ type: "price_chart", pair: "ETH/USDC", range: "24h" }],
  rationale: "r",
};
const mandate = {
  kind: "custodia.mandate.task.1",
  taskId: "abcd1234",
  owner,
  agent,
  ens: "abcd1234.alice.custodia.eth",
  constraints: [{ type: "custodia.max_trade_usd.1", value: 100 }],
  iat: 1,
  exp: 2,
};

const seed = async (taskId: string) => {
  await ctx.db.insert(tables.tasks).values({
    id: taskId,
    userWallet: owner,
    ensName: `${taskId}.alice.custodia.eth`,
    status: "awaiting_authorization",
  });
  const [m] = await ctx.db
    .insert(tables.mandates)
    .values({
      taskId,
      version: 1,
      typedData: { ...mandate, taskId },
      signature: "0xsig",
      hash: "0xhash",
    })
    .returning({ id: tables.mandates.id });
  await ctx.db.insert(tables.proposals).values({
    id: `p-${taskId}`,
    runId: "r",
    taskId,
    ownerWallet: owner,
    version: 1,
    hash: "0xph",
    body: { market, uiSpec, proposal: { userLabel: "alice" } },
  });
  return { mandateId: m?.id ?? 0, proposalId: `p-${taskId}` };
};
const job = (payload: unknown) => ({
  id: 1,
  kind: "ens.publish",
  payload,
  dedupeKey: null,
  status: "leased",
  attempts: 1,
  leasedBy: "w",
  leasedUntil: null,
  runAfter: new Date(),
  lastError: null,
  createdAt: new Date(),
  finishedAt: null,
});

it("publishes once, records receipts, activates the task, and is a no-op on redelivery", async () => {
  mocks.createTask.mockResolvedValue({
    name: "abcd1234.alice.custodia.eth",
    recordsTxId: "0xaa",
    txId: "0xbb",
  });
  const ids = await seed("abcd1234");
  const run = () =>
    ensPublishHandler({
      db: ctx.db,
      job: job({ taskId: "abcd1234", ...ids }),
      heartbeat: async () => {},
    });
  await run();
  await run();
  expect(mocks.createTask).toHaveBeenCalledTimes(1);
  expect(mocks.createTask.mock.calls[0]?.[1]).toMatchObject({
    taskId: "abcd1234",
    userLabel: "alice",
    owner,
    agent,
    status: "active",
  });
  const [task] = await ctx.db.select().from(tables.tasks).where(eq(tables.tasks.id, "abcd1234"));
  expect(task?.status).toBe("active");
  const receipts = await ctx.db
    .select()
    .from(tables.receipts)
    .where(eq(tables.receipts.taskId, "abcd1234"));
  expect(receipts.map((r) => r.txId).sort()).toEqual(["0xaa", "0xbb"]);
  expect(await ctx.db.select().from(tables.outbox)).toHaveLength(1);
});

it("leaves the task awaiting authorization and throws when publication fails", async () => {
  mocks.createTask.mockRejectedValueOnce(new Error("rpc down"));
  const ids = await seed("ef01ef01");
  await expect(
    ensPublishHandler({
      db: ctx.db,
      job: job({ taskId: "ef01ef01", ...ids }),
      heartbeat: async () => {},
    }),
  ).rejects.toThrow("rpc down");
  const [task] = await ctx.db.select().from(tables.tasks).where(eq(tables.tasks.id, "ef01ef01"));
  expect(task?.status).toBe("awaiting_authorization");
});
