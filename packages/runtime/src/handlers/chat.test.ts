import { createTestDb, tables } from "@custodia/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runAgent: vi.fn() }));
vi.mock("@custodia/agent", () => ({
  runAgent: mocks.runAgent,
  classifyIntent: (message: string) => {
    if (/perp|mainnet/.test(message)) return "unsupported";
    if (/doing today|what is eth/i.test(message)) return "research";
    return "guard";
  },
}));
vi.mock("@custodia/ens", async (orig) => ({
  ...(await orig<object>()),
  getUserLabel: async () => "alice",
  makeTaskName: (t: string, u: string, p: string) => `${t}.${u}.${p}`,
}));

import { enqueueJob, leaseJob } from "../jobs.js";
import { HandlerRegistry, tick } from "../registry.js";
import { createRun, listEvents, loadRun } from "../runs.js";
import { chatHandler } from "./chat.js";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
  process.env.ENS_PARENT_NAME = "custodia.eth";
  await ctx.db.insert(tables.users).values({ wallet: "0xowner", ensLabel: "alice" });
});
afterAll(async () => {
  await ctx.close();
});

it("runs the agent, streams stages, stores the proposal and completes the run", async () => {
  mocks.runAgent.mockImplementation(async ({ onEvent }) => {
    onEvent({ type: "tool", name: "get_market_context", input: {} });
    onEvent({ type: "tool", name: "paid_risk_request", input: {} });
    onEvent({ type: "text", delta: "Here is your guard." });
    return {
      market: { pair: "ETH/USDC" },
      uiSpec: { intent: "configure_portfolio_guard", components: [], rationale: "r" },
      receipts: [],
      rationale: "r",
    };
  });
  const { runId } = await createRun(ctx.db, {
    conversationId: "c1",
    ownerWallet: "0xowner",
    kind: "chat",
    clientRequestId: "q1",
    input: { messages: [{ role: "user", content: "guard my eth" }], agent: "0xagent" },
  });
  await enqueueJob(ctx.db, {
    kind: "chat.run",
    payload: { runId },
    dedupeKey: `chat.run:${runId}`,
  });
  const registry = new HandlerRegistry().register("chat.run", chatHandler);
  expect(await tick(ctx.db, registry, "w1")).toBe("ran");

  const events = await listEvents(ctx.db, runId);
  expect(events.map((e) => e.stage)).toEqual(
    expect.arrayContaining(["fetching_context", "paying_analysis", "awaiting_signature", "done"]),
  );
  const done = events.at(-1)?.payload as { proposalId: string; ensName: string; taskId: string };
  expect(done.proposalId).toMatch(/[0-9a-f-]{36}/);
  expect(done.ensName).toMatch(/\.alice\.custodia\.eth$/);
  expect((await loadRun(ctx.db, runId))?.status).toBe("done");
  const [task] = await ctx.db.select().from(tables.tasks).where(eq(tables.tasks.id, done.taskId));
  expect(task?.status).toBe("draft");
  expect(await tick(ctx.db, registry, "w1")).toBe("idle");
  expect(await leaseJob(ctx.db, { workerId: "w1" })).toBeNull();
});

it("completes without a proposal when the agent ends in an explanation", async () => {
  mocks.runAgent.mockImplementation(async ({ onEvent }) => {
    onEvent({ type: "text", delta: "Nothing to guard: the wallet holds no supported assets." });
    return { market: null, uiSpec: null, receipts: [], rationale: "" };
  });
  const { runId } = await createRun(ctx.db, {
    conversationId: "c3",
    ownerWallet: "0xowner",
    kind: "chat",
    clientRequestId: "q3",
    input: { messages: [], agent: "0xagent" },
  });
  await enqueueJob(ctx.db, {
    kind: "chat.run",
    payload: { runId },
    dedupeKey: `chat.run:${runId}`,
  });
  const registry = new HandlerRegistry().register("chat.run", chatHandler);
  expect(await tick(ctx.db, registry, "w1")).toBe("ran");
  expect((await loadRun(ctx.db, runId))?.status).toBe("done");
  const last = (await listEvents(ctx.db, runId)).at(-1);
  expect(last).toMatchObject({ type: "result", payload: { proposalId: null, taskId: null } });
  expect(
    await ctx.db.select().from(tables.proposals).where(eq(tables.proposals.runId, runId)),
  ).toHaveLength(0);
});

it("does not mint an ENS task for a research question even if a UI spec is returned", async () => {
  mocks.runAgent.mockResolvedValue({
    market: { pair: "ETH/USDC", priceUsd: 2500, hourly: [] },
    uiSpec: { intent: "configure_portfolio_guard", components: [], rationale: "r" },
    receipts: [],
    rationale: "ETH is around $2500 with 6% realized vol.",
  });
  const { runId } = await createRun(ctx.db, {
    conversationId: "c4",
    ownerWallet: "0xowner",
    kind: "chat",
    clientRequestId: "q4",
    input: {
      messages: [{ role: "user", content: "What is ETH doing today?" }],
      agent: "0xagent",
    },
  });
  await enqueueJob(ctx.db, {
    kind: "chat.run",
    payload: { runId },
    dedupeKey: `chat.run:${runId}`,
  });
  const registry = new HandlerRegistry().register("chat.run", chatHandler);
  expect(await tick(ctx.db, registry, "w1")).toBe("ran");
  const last = (await listEvents(ctx.db, runId)).at(-1);
  expect(last).toMatchObject({ type: "result", payload: { proposalId: null, taskId: null } });
  expect(
    await ctx.db.select().from(tables.proposals).where(eq(tables.proposals.runId, runId)),
  ).toHaveLength(0);
});

it("fails the run WITHOUT retrying the agent when it throws", async () => {
  mocks.runAgent.mockRejectedValueOnce(new Error("provider down"));
  const { runId } = await createRun(ctx.db, {
    conversationId: "c2",
    ownerWallet: "0xowner",
    kind: "chat",
    clientRequestId: "q2",
    input: { messages: [], agent: "0xagent" },
  });
  await enqueueJob(ctx.db, {
    kind: "chat.run",
    payload: { runId },
    dedupeKey: `chat.run:${runId}`,
  });
  const registry = new HandlerRegistry().register("chat.run", chatHandler);
  expect(await tick(ctx.db, registry, "w1")).toBe("ran");
  expect((await loadRun(ctx.db, runId))?.status).toBe("failed");
  expect((await listEvents(ctx.db, runId)).at(-1)).toMatchObject({ type: "error" });
  // the job is done, not re-queued — a second tick must not call the agent again
  mocks.runAgent.mockClear();
  expect(await tick(ctx.db, registry, "w1")).toBe("idle");
  expect(mocks.runAgent).not.toHaveBeenCalled();
});
