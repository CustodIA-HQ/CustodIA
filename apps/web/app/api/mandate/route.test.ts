import {
  constraintsHash,
  MANDATE_DOMAIN,
  MANDATE_TYPES,
  type MarketContext,
  type UISpec,
} from "@custodia/schema";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createTask: vi.fn(),
  loadEnsConfig: vi.fn(),
}));

vi.mock("@custodia/ens", () => ({
  createTask: mocks.createTask,
  loadEnsConfig: mocks.loadEnsConfig,
}));

import { createSessionToken, SESSION_COOKIE_NAME } from "../auth/session";
import { POST } from "./route";

const owner = privateKeyToAccount(`0x${"11".repeat(32)}`);
const agent = privateKeyToAccount(`0x${"22".repeat(32)}`);
const conversationId = "00000000-0000-4000-8000-000000000003";
const agentKey = `0x${"22".repeat(32)}` as `0x${string}`;
const taskId = "a1b2c3d4";
const ensName = `${taskId}.wallet-${owner.address.slice(2, 10).toLowerCase()}.custodia.eth`;
const constraints = [
  { type: "custodia.allowed_assets.1" as const, assets: ["ETH", "USDC"] },
  { type: "custodia.max_drawdown_pct.1" as const, value: 4.4 },
  { type: "custodia.max_trade_usd.1" as const, value: 1_000 },
  { type: "custodia.allow_rebalance.1" as const, value: false },
];
const market: MarketContext = {
  pair: "ETH/USDC",
  priceUsd: 2_000,
  realizedVol24hPct: 2,
  tvlUsd: 1_000_000,
  hourly: Array.from({ length: 24 }, (_, index) => ({
    ts: 1_700_000_000 + index * 3_600,
    close: 2_000 + index,
  })),
  block: 1,
  fetchedAt: 1_700_000_000_000,
};
const uiSpec: UISpec = {
  intent: "configure_portfolio_guard",
  components: [
    { type: "price_chart", pair: "ETH/USDC", range: "7d" },
    { type: "allocation_selector", assets: ["ETH", "USDC"], defaultPct: [50, 50] },
    { type: "range_slider", id: "max_drawdown_pct", min: 1.1, max: 4.4, default: 4.4 },
    { type: "amount_selector", id: "max_trade_usd", min: 0, max: 1_000, default: 1_000 },
    {
      type: "permission_toggle",
      id: "allow_rebalance",
      default: false,
      consequence: "Rebalancing remains off.",
    },
    {
      type: "risk_summary",
      risk: {
        volatility24hPct: 2,
        concentrationPct: 50,
        maxTradeEnvelopeUsd: 1_000,
        drawdownRange: [1.1, 4.4],
        explanation: "Fixture risk.",
      },
      receiptTxId: "fixture-receipt",
    },
  ],
  rationale: "Fixture guard.",
};

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("AGENT_PRIVATE_KEY", agentKey);
  mocks.loadEnsConfig.mockReturnValue({
    rpcUrl: "https://example.invalid",
    parentName: "custodia.eth",
    resolverAddress: `0x${"33".repeat(20)}`,
    operatorKey: `0x${"44".repeat(32)}`,
    agentKey,
    operatorAddress: `0x${"44".repeat(20)}`,
    agentAddress: agent.address,
  });
  mocks.createTask.mockResolvedValue({
    name: ensName,
    recordsTxId: `0x${"55".repeat(32)}`,
    txId: `0x${"66".repeat(32)}`,
  });
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

it("verifies the signed mandate and sends the chart payload to ENS", async () => {
  const iat = Math.floor(Date.now() / 1_000);
  const exp = iat + 60 * 60;
  const mandate = {
    kind: "custodia.mandate.task.1" as const,
    taskId,
    owner: owner.address,
    agent: agent.address,
    ens: ensName,
    constraints,
    iat,
    exp,
  };
  const signature = await owner.signTypedData({
    domain: MANDATE_DOMAIN,
    types: MANDATE_TYPES,
    primaryType: "Mandate",
    message: {
      kind: mandate.kind,
      taskId,
      owner: owner.address,
      agent: agent.address,
      ens: ensName,
      constraintsHash: constraintsHash(constraints),
      iat: BigInt(iat),
      exp: BigInt(exp),
    },
  });
  const token = createSessionToken({
    address: owner.address,
    agent: agent.address,
    conversationId,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  });

  const response = await POST(
    new Request("https://example.com/api/mandate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
      body: JSON.stringify({ conversationId, mandate, signature, market, uiSpec }),
    }),
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ name: ensName, taskId });
  expect(mocks.createTask).toHaveBeenCalledWith(
    expect.objectContaining({ parentName: "custodia.eth" }),
    expect.objectContaining({
      userLabel: ensName.split(".")[1],
      taskId,
      owner: owner.address,
      agent: agent.address,
      chart: expect.stringContaining('"schema":"custodia.chart.1"'),
      ui: expect.stringContaining('"intent":"configure_portfolio_guard"'),
    }),
  );
});
