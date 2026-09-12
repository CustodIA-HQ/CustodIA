import { expect, it } from "vitest";
import { evaluateAllocations, enumerateCandidates, filterFeasible } from "../src/index.js";

it("always includes the unchanged allocation as a candidate", () => {
  const candidates = enumerateCandidates({ ethUsd: 50, usdcUsd: 50 });
  expect(candidates.some((c) => c.ethPct === 50 && c.usdcPct === 50 && c.distance === 0)).toBe(true);
  expect(candidates.length).toBeGreaterThan(10);
});

it("two wallets with different balances produce different feasible sets", () => {
  const funded = evaluateAllocations({ ethUsd: 800, usdcUsd: 200, minTradeUsd: 10 });
  const empty = evaluateAllocations({ ethUsd: 0, usdcUsd: 0, minTradeUsd: 10 });
  expect(funded.some((c) => c.feasible && c.distance > 0)).toBe(true);
  expect(empty.every((c) => !c.feasible || c.distance === 0)).toBe(true);
  expect(empty.filter((c) => c.feasible).every((c) => c.estTradeUsd === 0)).toBe(true);
});

it("respects a rebalance veto", () => {
  const vetoed = filterFeasible(enumerateCandidates({ ethUsd: 80, usdcUsd: 20 }), {
    ethUsd: 80,
    usdcUsd: 20,
    allowRebalance: false,
  });
  expect(vetoed.filter((c) => c.feasible)).toHaveLength(1);
  expect(vetoed.find((c) => c.feasible)?.distance).toBe(0);
});
