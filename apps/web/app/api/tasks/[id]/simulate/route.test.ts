import { createTestDb, tables } from "@custodia/db";
import type { Mandate } from "@custodia/schema";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  db: undefined as unknown,
  market: vi.fn(),
  wallet: vi.fn(),
  session: vi.fn(),
}));
vi.mock("@custodia/db", async (original) => ({
  ...(await original<typeof import("@custodia/db")>()),
  createPooledDb: () => mocks.db,
}));
vi.mock("@custodia/graph", () => ({ getMarketContext: mocks.market }));
vi.mock("@custodia/agent", () => ({ readPortfolio: mocks.wallet }));
vi.mock("../../../session", () => ({ sessionFrom: mocks.session }));

import { POST } from "./route";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
const owner = "0x1111111111111111111111111111111111111111";
const now = Math.floor(Date.now() / 1000);
const mandate: Mandate = {
  kind: "custodia.mandate.task.1",
  taskId: "12345678",
  owner,
  agent: owner,
  ens: "12345678.test.custodia.eth",
  iat: now - 100,
  exp: now + 3600,
  constraints: [
    { type: "custodia.allow_rebalance.1", value: true },
    { type: "custodia.allowed_assets.1", assets: ["ETH", "USDC"] },
    { type: "custodia.max_trade_usd.1", value: 500 },
    { type: "custodia.max_notional_usd.1", value: 600 },
  ],
};
beforeAll(async () => {
  ctx = await createTestDb();
  mocks.db = ctx.db;
  mocks.session.mockReturnValue({ address: owner });
  mocks.wallet.mockResolvedValue({ eth: "1", usdc: "1000", snapshot: { chainId: 11155111 } });
  mocks.market.mockResolvedValue({
    pair: "ETH/USDC",
    base: "ETH",
    quote: "USDC",
    poolId: "fixture",
    poolName: "fixture",
    priceUsd: 2000,
    realizedVol24hPct: 1,
    tvlUsd: 1000000,
    block: 123,
    sourceTimestamp: now,
    fetchedAt: Date.now(),
    hourly: Array.from({ length: 24 }, (_, i) => ({ ts: now - (23 - i) * 3600, close: 2000 })),
  });
  await ctx.db
    .insert(tables.tasks)
    .values({ id: "12345678", userWallet: owner, ensName: mandate.ens, status: "active" });
  await ctx.db.insert(tables.mandates).values({
    taskId: "12345678",
    version: 1,
    typedData: mandate,
    signature: "0x1234",
    hash: "hash",
  });
}, 30000);
afterAll(async () => ctx.close());
const request = (requestId: string, notionalUsd = 100) =>
  new Request("http://localhost/api/tasks/12345678/simulate", {
    method: "POST",
    body: JSON.stringify({ fromAsset: "USDC", toAsset: "ETH", notionalUsd, requestId }),
  });
const params = { params: Promise.resolve({ id: "12345678" }) };
it("retries return the original fill and do not debit twice", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const first = await POST(request(id), params);
  expect(first.status).toBe(200);
  const a = await first.json();
  const b = await (await POST(request(id), params)).json();
  expect(b).toEqual(a);
  expect(a.state.usdc).toBe(899.95);
  expect(await ctx.db.select().from(tables.receipts)).toHaveLength(1);
});
it("serializes concurrent paper requests against the same ledger", async () => {
  const ids = ["00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003"];
  const responses = await Promise.all(ids.map((id) => POST(request(id, 300), params)));
  const payloads = await Promise.all(responses.map((r) => r.json()));
  expect(payloads.filter((p) => p.decision.allowed)).toHaveLength(1);
  expect(payloads.filter((p) => !p.decision.allowed)).toHaveLength(1);
  const rows = await ctx.db.select().from(tables.receipts);
  expect(rows).toHaveLength(3);
});
it("rejects malformed amounts instead of silently substituting a trade", async () => {
  expect((await POST(request("00000000-0000-4000-8000-000000000004", -1), params)).status).toBe(
    400,
  );
});
it("stale data cannot create a fill", async () => {
  const current = await mocks.market();
  mocks.market.mockResolvedValueOnce({ ...current, fetchedAt: Date.now() - 300000 });
  const before = await ctx.db.select().from(tables.receipts);
  expect((await POST(request("00000000-0000-4000-8000-000000000005"), params)).status).toBe(503);
  expect(await ctx.db.select().from(tables.receipts)).toHaveLength(before.length);
});
it("rejects an old indexed block even when it was just fetched", async () => {
  const current = await mocks.market();
  mocks.market.mockResolvedValueOnce({
    ...current,
    fetchedAt: Date.now(),
    sourceTimestamp: now - 600,
  });
  expect((await POST(request("00000000-0000-4000-8000-000000000007"), params)).status).toBe(503);
});
it("revoked tasks cannot fill or initialize new ledgers", async () => {
  await ctx.db.update(tables.tasks).set({ status: "revoked" });
  expect((await POST(request("00000000-0000-4000-8000-000000000006"), params)).status).toBe(409);
});
