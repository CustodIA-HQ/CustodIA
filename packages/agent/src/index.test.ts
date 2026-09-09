import type { MarketCache } from "@custodia/db";
import { UISpecSchema } from "@custodia/schema";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runTools: vi.fn(), market: vi.fn(), pay: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    chat = { completions: { runTools: mocks.runTools } };
  },
}));
vi.mock("@custodia/graph", () => ({ getMarketContext: mocks.market }));
vi.mock("./x402.js", () => ({ paidFetch: mocks.pay, PaymentError: Error }));

import { runAgent } from "./index.js";

type Tool = { function: { name: string }; $callback: (input: unknown) => Promise<string> };
const risk = {
  volatility24hPct: 2,
  concentrationPct: 60,
  maxTradeEnvelopeUsd: 500,
  drawdownRange: [1, 5],
  explanation: "Fixture risk data",
};
const request = { assets: ["ETH", "USDC"], sizeUsd: 10000, allocationPct: [60, 40] };
const components = [
  { type: "range_slider", id: "max_drawdown_pct", min: 0, max: 90, default: 80 },
  { type: "amount_selector", id: "max_trade_usd", min: 0, max: 9000, default: 8000 },
  { type: "risk_summary", risk: { fabricated: true }, receiptTxId: "fake" },
];
const emit = { rationale: "Fixture proposal", components_json: JSON.stringify(components) };
const cache: MarketCache = { get: async () => null, set: async () => {} };
const address = "0x1111111111111111111111111111111111111111" as const;
const options = {
  messages: [{ role: "user" as const, content: "Fixture prompt" }],
  cache,
  owner: address,
  agent: address,
  onEvent: vi.fn(),
};

function simulate(
  work: (call: (name: string, input: unknown) => Promise<string>) => Promise<void>,
) {
  mocks.runTools.mockImplementation(({ tools }: { tools: Tool[] }) => ({
    on: vi.fn(),
    finalContent: () =>
      work((name, input) => {
        const tool = tools.find((entry) => entry.function.name === name);
        if (!tool) throw new Error(`Missing tool ${name}`);
        return tool.$callback(input);
      }),
  }));
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("OPENAI_API_KEY", "test");
  mocks.market.mockResolvedValue({ pair: "ETH/USDC", price: 2000 });
  mocks.pay.mockResolvedValue({
    data: risk,
    receipt: {
      kind: "x402",
      txId: "fixture-receipt",
      network: "hedera:testnet",
    },
  });
});
afterEach(() => vi.unstubAllEnvs());

it("clips model bounds and replaces fabricated risk data with the paid context", async () => {
  simulate(async (call) => {
    await call("get_market_context", { pair: "ETH/USDC" });
    await call("paid_risk_request", request);
    await call("emit_ui_spec", emit);
  });
  const result = await runAgent(options);
  const spec = UISpecSchema.parse(result.uiSpec);
  expect(spec.components).toEqual([
    expect.objectContaining({ min: 1, max: 5, default: 5 }),
    expect.objectContaining({ min: 0, max: 500, default: 500 }),
    { type: "risk_summary", risk, receiptTxId: "fixture-receipt" },
  ]);
  expect(result.receipts).toHaveLength(1);
});
it("does not pay again when the model repeats its risk tool call", async () => {
  simulate(async (call) => {
    await call("paid_risk_request", request);
    expect(await call("paid_risk_request", request)).toContain("Denied");
  });
  await runAgent(options);
  expect(mocks.pay).toHaveBeenCalledTimes(1);
});
it("rejects UI emission before a paid context exists", async () => {
  simulate(async (call) => {
    await call("emit_ui_spec", emit);
  });
  await expect(runAgent(options)).rejects.toThrow("before a paid risk context");
  expect(mocks.pay).not.toHaveBeenCalled();
});
