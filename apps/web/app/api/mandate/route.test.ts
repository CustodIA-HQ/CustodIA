import { constraintsHash, MANDATE_DOMAIN, MANDATE_TYPES } from "@custodia/schema";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, expect, it, vi } from "vitest";

const owner = privateKeyToAccount(`0x${"11".repeat(32)}`);
const agent = "0x1111111111111111111111111111111111111111" as const;
const conversationId = "00000000-0000-4000-8000-000000000001";
const proposalId = "00000000-0000-4000-8000-00000000aaaa";

const mocks = vi.hoisted(() => ({
  loadProposal: vi.fn(),
  enqueueJob: vi.fn(async () => ({ jobId: 9, created: true })),
  createTask: vi.fn(),
  inserted: [] as unknown[],
}));
vi.mock("@custodia/runtime", () => ({
  loadProposal: mocks.loadProposal,
  enqueueJob: mocks.enqueueJob,
}));
vi.mock("@custodia/ens", () => ({
  createTask: mocks.createTask,
  loadEnsConfig: () => ({
    parentName: "custodia.eth",
    agentAddress: "0x1111111111111111111111111111111111111111",
  }),
}));
vi.mock("@custodia/db", () => ({
  createDb: () => ({
    insert: () => ({
      values: (v: unknown) => {
        mocks.inserted.push(v);
        return { returning: async () => [{ id: 7 }] };
      },
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  }),
  tables: { mandates: {}, tasks: { id: "id" } },
}));
vi.mock("../identity", () => ({
  getAgentAddress: () => "0x1111111111111111111111111111111111111111",
}));

import { createSessionToken, SESSION_COOKIE_NAME } from "../auth/session";
import { POST } from "./route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mocks.inserted.length = 0;
});

const cookie = () => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  return `${SESSION_COOKIE_NAME}=${createSessionToken({ address: owner.address, agent, conversationId, issuedAt: Date.now(), expiresAt: Date.now() + 60_000 })}`;
};
const uiSpec = {
  intent: "configure_portfolio_guard",
  components: [
    { type: "price_chart", pair: "ETH/USDC", range: "24h" },
    { type: "range_slider", id: "max_drawdown_pct", min: 1.4, max: 5.4, default: 3 },
    { type: "amount_selector", id: "max_trade_usd", min: 0, max: 10000, default: 5000 },
  ],
  rationale: "r",
};
const proposalRow = () => ({
  id: proposalId,
  runId: "run-1",
  taskId: "abcd1234",
  ownerWallet: owner.address,
  version: 1,
  hash: "0xph",
  body: {
    market: { pair: "ETH/USDC" },
    uiSpec,
    proposal: { taskId: "abcd1234", ensName: "abcd1234.alice.custodia.eth", userLabel: "alice" },
  },
});
const signedMandate = async (constraints: unknown[]) => {
  const iat = Math.floor(Date.now() / 1000);
  const mandate = {
    kind: "custodia.mandate.task.1",
    taskId: "abcd1234",
    owner: owner.address,
    agent,
    ens: "abcd1234.alice.custodia.eth",
    constraints,
    iat,
    exp: iat + 3600,
  };
  const signature = await owner.signTypedData({
    domain: MANDATE_DOMAIN,
    types: MANDATE_TYPES,
    primaryType: "Mandate",
    message: {
      kind: mandate.kind,
      taskId: mandate.taskId,
      owner: mandate.owner,
      agent: mandate.agent,
      ens: mandate.ens,
      constraintsHash: constraintsHash(constraints as never),
      iat: BigInt(iat),
      exp: BigInt(mandate.exp),
    },
  });
  return { mandate, signature };
};
const post = (body: unknown) =>
  POST(
    new Request("http://x/api/mandate", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookie() },
      body: JSON.stringify(body),
    }),
  );
const within = [
  { type: "custodia.allowed_assets.1", assets: ["ETH", "USDC"] },
  { type: "custodia.max_drawdown_pct.1", value: 5.4 },
  { type: "custodia.max_trade_usd.1", value: 10000 },
  { type: "custodia.allow_rebalance.1", value: false },
];

it("accepts a mandate within the stored proposal's bounds and enqueues publication", async () => {
  mocks.loadProposal.mockResolvedValue(proposalRow());
  const res = await post({ conversationId, proposalId, ...(await signedMandate(within)) });
  expect(res.status).toBe(202);
  expect(await res.json()).toMatchObject({
    taskId: "abcd1234",
    ensName: "abcd1234.alice.custodia.eth",
    jobId: 9,
  });
  expect(mocks.enqueueJob).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ kind: "ens.publish", dedupeKey: "ens.publish:abcd1234" }),
  );
  expect(mocks.createTask).not.toHaveBeenCalled(); // publication is the worker's job
});

it("rejects limits outside the proposal bounds", async () => {
  mocks.loadProposal.mockResolvedValue(proposalRow());
  const over = within.map((c) =>
    c.type === "custodia.max_trade_usd.1" ? { ...c, value: 20000 } : c,
  );
  const res = await post({ conversationId, proposalId, ...(await signedMandate(over)) });
  expect(res.status).toBe(400);
  expect((await res.json()).error).toMatch(/outside the proposal bounds/);
  expect(mocks.enqueueJob).not.toHaveBeenCalled();
});

it("ignores browser-supplied market data and UI (strict body)", async () => {
  mocks.loadProposal.mockResolvedValue(proposalRow());
  const res = await post({
    conversationId,
    proposalId,
    ...(await signedMandate(within)),
    market: { pair: "ETH/USDC" },
    uiSpec,
  });
  expect(res.status).toBe(400);
  expect(mocks.enqueueJob).not.toHaveBeenCalled();
});

it("rejects a proposal owned by another wallet", async () => {
  mocks.loadProposal.mockResolvedValue({
    ...proposalRow(),
    ownerWallet: "0x3333333333333333333333333333333333333333",
  });
  const res = await post({ conversationId, proposalId, ...(await signedMandate(within)) });
  expect(res.status).toBe(404);
});
