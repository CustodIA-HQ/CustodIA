import { describe, it, expect } from "vitest";
import { evaluate, X402_MAX_HBAR_PER_TASK, type PolicyState } from "../src/index.js";
import type { Mandate } from "@custodia/schema";

describe("Policy Engine Evaluation", () => {
  const dummyMandate: Mandate = {
    kind: "custodia.mandate.task.1",
    taskId: "1234abcd",
    owner: "0x1234567890123456789012345678901234567890",
    agent: "0x0987654321098765432109876543210987654321",
    ens: "test.eth",
    constraints: [],
    iat: 1000,
    exp: 2000,
  };

  const defaultState: PolicyState = {
    spentUsd: 0,
    now: 1500,
  };

  it("should allow pay_x402 within budget", () => {
    const action = { kind: "pay_x402" as const, amountHbar: 0.5, endpoint: "http://test" };
    const decision = evaluate(dummyMandate, action, defaultState);
    expect(decision.allowed).toBe(true);
  });

  it("should deny pay_x402 over budget", () => {
    const action = { kind: "pay_x402" as const, amountHbar: X402_MAX_HBAR_PER_TASK + 0.1, endpoint: "http://test" };
    const decision = evaluate(dummyMandate, action, defaultState);
    expect(decision.allowed).toBe(false);
  });

  it("should deny expired mandate", () => {
    const action = { kind: "pay_x402" as const, amountHbar: 0.1, endpoint: "http://test" };
    const decision = evaluate(dummyMandate, action, { ...defaultState, now: 2500 });
    expect(decision.allowed).toBe(false);
  });

  it("should deny max_trade_usd violation", () => {
    const mandateWithConstraint: Mandate = {
      ...dummyMandate,
      constraints: [{ type: "custodia.max_trade_usd.1", value: 1000 }],
    };
    const action = { kind: "rebalance" as const, fromAsset: "ETH", toAsset: "USDC", notionalUsd: 1500, reason: "test" };
    const decision = evaluate(mandateWithConstraint, action, defaultState);
    expect(decision.allowed).toBe(false);
  });
});
