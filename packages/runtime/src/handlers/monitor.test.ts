import type { Mandate } from "@custodia/schema";
import { parseEther, parseUnits } from "viem";
import { expect, it } from "vitest";
import { decideAutonomy, targetFromProposal } from "./monitor.js";

const mandate = (constraints: Mandate["constraints"]): Mandate => ({
  kind: "custodia.mandate.task.1",
  taskId: "abcd1234",
  owner: "0x2222222222222222222222222222222222222222",
  agent: "0x1111111111111111111111111111111111111111",
  ens: "abcd1234.alice.custodia.eth",
  constraints,
  iat: 1,
  exp: 2_000_000_000,
});
const caps = {
  weth: { maxTrade: parseEther("0.02"), maxCumulative: parseEther("1") },
  usdc: { maxTrade: parseUnits("50", 6), maxCumulative: parseUnits("1000", 6) },
};

it("does nothing inside the boundary and raises the high-water mark on gains", () => {
  const calm = decideAutonomy({
    mandate: mandate([{ type: "custodia.max_drawdown_pct.1", value: 10 }]),
    targetEthPct: null,
    vault: { weth: parseEther("0.1"), usdc: parseUnits("100", 6), caps },
    priceUsd: 2500,
    highWaterUsd: 350,
  });
  expect(calm.order).toBeNull();
  expect(calm.highWaterUsd).toBe(350);
  const up = decideAutonomy({
    mandate: mandate([{ type: "custodia.max_drawdown_pct.1", value: 10 }]),
    targetEthPct: null,
    vault: { weth: parseEther("0.1"), usdc: 0n, caps },
    priceUsd: 3000,
    highWaterUsd: 250,
  });
  expect(up.order).toBeNull();
  expect(up.highWaterUsd).toBe(300);
});

it("drawdown guard executes on its own, one per-trade cap at a time", () => {
  const d = decideAutonomy({
    mandate: mandate([{ type: "custodia.max_drawdown_pct.1", value: 10 }]),
    targetEthPct: null,
    vault: { weth: parseEther("0.1"), usdc: 0n, caps },
    priceUsd: 2200, // $220 vs a high of $300 → 26.7 % drawdown
    highWaterUsd: 300,
  });
  expect(d.mode).toBe("execute");
  expect(d.order).toEqual({ sell: "ETH", buy: "USDC", amount: 0.02 });
  expect(d.reason).toMatch(/drawdown guard: .*26\.7% below/);
});

it("rebalance is only proposed, only when allowed, only past the tolerance", () => {
  const drifted = {
    targetEthPct: 50,
    vault: { weth: parseEther("0.1"), usdc: parseUnits("100", 6), caps }, // 71 % ETH at $2,500
    priceUsd: 2500,
    highWaterUsd: 350,
  };
  expect(
    decideAutonomy({
      mandate: mandate([{ type: "custodia.allow_rebalance.1", value: false }]),
      ...drifted,
    }).order,
  ).toBeNull();
  const sell = decideAutonomy({
    mandate: mandate([{ type: "custodia.allow_rebalance.1", value: true }]),
    ...drifted,
  });
  expect(sell.mode).toBe("confirm");
  expect(sell.order).toEqual({ sell: "ETH", buy: "USDC", amount: 0.02 }); // $75 delta, capped
  expect(sell.reason).toMatch(/rebalance: ETH is 71\.4%/);
  const buy = decideAutonomy({
    mandate: mandate([{ type: "custodia.allow_rebalance.1", value: true }]),
    targetEthPct: 50,
    vault: { weth: parseEther("0.01"), usdc: parseUnits("100", 6), caps }, // 20 % ETH
    priceUsd: 2500,
    highWaterUsd: 125,
  });
  expect(buy.mode).toBe("confirm");
  expect(buy.order).toEqual({ sell: "USDC", buy: "ETH", amount: 37.5 });
  expect(
    decideAutonomy({
      mandate: mandate([{ type: "custodia.allow_rebalance.1", value: true }]),
      ...drifted,
      targetEthPct: 70,
    }).order,
  ).toBeNull();
});

it("reads the signed target from the proposal's allocation selector", () => {
  expect(
    targetFromProposal({
      uiSpec: {
        intent: "configure_portfolio_guard",
        rationale: "",
        components: [
          { type: "allocation_selector", assets: ["ETH", "USDC"], defaultPct: [60, 40] },
        ],
      },
    }),
  ).toBe(60);
  expect(targetFromProposal({ uiSpec: { components: [] } })).toBeNull();
  expect(targetFromProposal(null)).toBeNull();
});

it("a signed target_eth_pct constraint overrides the proposal's default split", () => {
  const body = {
    uiSpec: {
      intent: "configure_portfolio_guard",
      rationale: "",
      components: [{ type: "allocation_selector", assets: ["ETH", "USDC"], defaultPct: [100, 0] }],
    },
  };
  expect(
    targetFromProposal(body, mandate([{ type: "custodia.target_eth_pct.1", value: 50 }])),
  ).toBe(50);
  expect(targetFromProposal(body, mandate([]))).toBe(100);
});
