import type { Mandate } from "@custodia/schema";
import { expect, it } from "vitest";
import { paperFill, replayPaper, seedPaper } from "../src/paper.js";

const mandate: Mandate = {
  kind: "custodia.mandate.task.1",
  taskId: "12345678",
  owner: "0x1111111111111111111111111111111111111111",
  agent: "0x2222222222222222222222222222222222222222",
  ens: "t.user.custodia.eth",
  iat: 0,
  exp: 10000,
  constraints: [
    { type: "custodia.allow_rebalance.1", value: true },
    { type: "custodia.allowed_assets.1", assets: ["ETH", "USDC"] },
    { type: "custodia.max_trade_usd.1", value: 500 },
    { type: "custodia.max_notional_usd.1", value: 600 },
  ],
};
const buy = {
  kind: "rebalance" as const,
  fromAsset: "USDC",
  toAsset: "ETH",
  notionalUsd: 500,
  reason: "test",
};
const point = { ts: 100, priceUsd: 2000 };
it("debits fees and adverse buy slippage while preserving wallet-independent state", () => {
  const state = seedPaper(1, 1000, point);
  const result = paperFill(state, point, buy, mandate);
  expect(state.usdc).toBe(1000);
  expect(result.state.usdc).toBe(499.75);
  expect(result.fill?.fillPriceUsd).toBeCloseTo(2002);
  expect(result.state.eth).toBeCloseTo(1 + 500 / 2002);
  expect(result.pnlUsd).toBeLessThan(0);
});
it("sell fills account for adverse price and fees", () => {
  const result = paperFill(
    seedPaper(1, 0, point),
    point,
    { ...buy, fromAsset: "ETH", toAsset: "USDC" },
    mandate,
  );
  expect(result.state.eth).toBe(0.75);
  expect(result.state.usdc).toBeCloseTo(499.25);
});
it("refuses overspending, expired mandates, unsupported assets and missing permission", () => {
  const state = seedPaper(1, 1, point);
  for (const [action, m] of [
    [buy, mandate],
    [
      { ...buy, fromAsset: "ETH", toAsset: "USDC" },
      { ...mandate, exp: 99 },
    ],
    [{ ...buy, toAsset: "WETH" }, mandate],
    [buy, { ...mandate, constraints: [] }],
  ] as const) {
    const result = paperFill(state, point, action, m as Mandate);
    expect(result.decision.allowed).toBe(false);
    expect(result.fill).toBeNull();
    expect(result.state.spentUsd).toBe(0);
    expect(result.state.eth).toBe(1);
  }
});
it("enforces cumulative spend and high-water drawdown", () => {
  const initial = seedPaper(1, 1000, point);
  const first = paperFill(initial, point, buy, mandate);
  expect(
    paperFill(first.state, point, { ...buy, notionalUsd: 200 }, mandate).decision.allowed,
  ).toBe(false);
  const falling = paperFill(
    initial,
    { ts: 101, priceUsd: 1000 },
    { ...buy, fromAsset: "ETH", toAsset: "USDC" },
    {
      ...mandate,
      constraints: [...mandate.constraints, { type: "custodia.max_drawdown_pct.1", value: 5 }],
    },
  );
  expect(falling.decision.reason).toContain("drawdown");
});
it("replay is deterministic and uses the NEXT price for fills", () => {
  const points = [point, { ts: 101, priceUsd: 4000 }, { ts: 102, priceUsd: 1000 }];
  const a = replayPaper({ eth: 0, usdc: 1000 }, points, mandate, 50);
  expect(a).toEqual(replayPaper({ eth: 0, usdc: 1000 }, points, mandate, 50));
  expect(a.results[0]?.fill?.fillPriceUsd).toBeCloseTo(4004);
  expect(a.buyAndHoldUsd).toBe(1000);
});
it("rejects reversed timestamps and invalid costs", () => {
  const state = seedPaper(1, 1000, point);
  expect(() => paperFill(state, { ...point, ts: 99 }, buy, mandate)).toThrow();
  expect(() => paperFill(state, point, buy, mandate, { feeBps: NaN, slippageBps: 10 })).toThrow();
});
