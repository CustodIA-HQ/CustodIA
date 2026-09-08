import type { Mandate, ProposedAction } from "@custodia/schema";
import { describe, expect, it } from "vitest";
import { evaluate, X402_MAX_HBAR_PER_TASK } from "../src/index.js";

const ADDR_A = "0x1111111111111111111111111111111111111111";
const ADDR_B = "0x2222222222222222222222222222222222222222";

/** A valid, in-window mandate with zero constraints — the baseline. */
const baseMandate = (overrides: Partial<Mandate> = {}): Mandate => ({
  kind: "custodia.mandate.task.1",
  taskId: "a1b2c3d4",
  owner: ADDR_A,
  agent: ADDR_B,
  ens: "a1b2c3d4.alice.custodia.eth",
  constraints: [],
  iat: 1_700_000_000,
  exp: 1_800_000_000,
  ...overrides,
});

interface RebalanceOverrides {
  fromAsset?: string;
  toAsset?: string;
  notionalUsd?: number;
  reason?: string;
}

const rebalance = (overrides: RebalanceOverrides = {}): ProposedAction => ({
  kind: "rebalance",
  fromAsset: "ETH",
  toAsset: "USDC",
  notionalUsd: 1000,
  reason: "test",
  ...overrides,
});

const payX402 = (amountHbar = 0.1): ProposedAction => ({
  kind: "pay_x402",
  amountHbar,
  endpoint: "http://localhost:8402/risk/portfolio",
});

const state = (overrides: Partial<{ spentUsd: number; now: number }> = {}) => ({
  spentUsd: 0,
  now: 1_750_000_000,
  ...overrides,
});

describe("evaluate", () => {
  describe("time window", () => {
    it("allows an action inside the mandate window", () => {
      const decision = evaluate(baseMandate(), rebalance(), state());
      expect(decision.allowed).toBe(true);
    });

    it("denies after expiry", () => {
      const decision = evaluate(baseMandate(), rebalance(), state({ now: 1_800_000_001 }));
      expect(decision).toMatchObject({ allowed: false, violated: undefined });
      expect(decision.reason).toMatch(/expired/i);
    });

    it("denies before the mandate becomes active", () => {
      const decision = evaluate(baseMandate(), rebalance(), state({ now: 1_699_999_999 }));
      expect(decision).toMatchObject({ allowed: false, violated: undefined });
      expect(decision.reason).toMatch(/not active/i);
    });
  });

  describe("allowed_assets", () => {
    const withAssets = (assets: string[]) =>
      baseMandate({ constraints: [{ type: "custodia.allowed_assets.1", assets }] });

    it("allows a trade inside the allowlist", () => {
      const decision = evaluate(withAssets(["ETH", "USDC"]), rebalance(), state());
      expect(decision.allowed).toBe(true);
    });

    it("denies a trade touching an asset outside the allowlist", () => {
      const decision = evaluate(
        withAssets(["ETH"]),
        rebalance({ fromAsset: "USDC", toAsset: "ETH" }),
        state(),
      );
      expect(decision).toMatchObject({ allowed: false, violated: "custodia.allowed_assets.1" });
    });
  });

  describe("allow_rebalance", () => {
    it("allows rebalancing when the flag is true", () => {
      const decision = evaluate(
        baseMandate({ constraints: [{ type: "custodia.allow_rebalance.1", value: true }] }),
        rebalance(),
        state(),
      );
      expect(decision.allowed).toBe(true);
    });

    it("denies rebalancing when the flag is false", () => {
      const decision = evaluate(
        baseMandate({ constraints: [{ type: "custodia.allow_rebalance.1", value: false }] }),
        rebalance(),
        state(),
      );
      expect(decision).toMatchObject({ allowed: false, violated: "custodia.allow_rebalance.1" });
    });
  });

  describe("max_trade_usd", () => {
    const withMaxTrade = (value: number) =>
      baseMandate({ constraints: [{ type: "custodia.max_trade_usd.1", value }] });

    it("allows a trade at or under the ceiling", () => {
      const decision = evaluate(withMaxTrade(5000), rebalance({ notionalUsd: 5000 }), state());
      expect(decision.allowed).toBe(true);
    });

    it("denies a trade over the ceiling", () => {
      const decision = evaluate(withMaxTrade(1000), rebalance({ notionalUsd: 1000.01 }), state());
      expect(decision).toMatchObject({ allowed: false, violated: "custodia.max_trade_usd.1" });
    });
  });

  describe("max_notional_usd (cumulative)", () => {
    const withMaxNotional = (value: number) =>
      baseMandate({ constraints: [{ type: "custodia.max_notional_usd.1", value }] });

    it("allows a trade that stays under the cumulative ceiling", () => {
      const decision = evaluate(
        withMaxNotional(10_000),
        rebalance({ notionalUsd: 4000 }),
        state({ spentUsd: 4000 }),
      );
      expect(decision.allowed).toBe(true);
    });

    it("denies when spent + trade would exceed the cumulative ceiling", () => {
      const decision = evaluate(
        withMaxNotional(10_000),
        rebalance({ notionalUsd: 6001 }),
        state({ spentUsd: 4000 }),
      );
      expect(decision).toMatchObject({ allowed: false, violated: "custodia.max_notional_usd.1" });
      expect(decision.reason).toMatch(/10,001/); // 4000 + 6001 — cites the projected total
    });
  });

  describe("pay_x402 budget", () => {
    it("allows a payment within the fixed prototype budget", () => {
      const decision = evaluate(baseMandate(), payX402(X402_MAX_HBAR_PER_TASK), state());
      expect(decision.allowed).toBe(true);
    });

    it("denies a payment over the fixed prototype budget", () => {
      const decision = evaluate(baseMandate(), payX402(X402_MAX_HBAR_PER_TASK + 1), state());
      expect(decision).toMatchObject({ allowed: false, violated: undefined });
      expect(decision.reason).toMatch(/prototype budget/i);
    });

    // pay_x402 is checked BEFORE the rebalance constraints — a budget-denied
    // x402 call must never proceed to asset/trade checks.
    it("denies an oversized payment even with permissive rebalance constraints", () => {
      const decision = evaluate(
        baseMandate({
          constraints: [
            { type: "custodia.max_trade_usd.1", value: 1_000_000 },
            { type: "custodia.max_notional_usd.1", value: 1_000_000 },
          ],
        }),
        payX402(X402_MAX_HBAR_PER_TASK * 10),
        state(),
      );
      expect(decision).toMatchObject({ allowed: false, violated: undefined });
    });
  });
});
