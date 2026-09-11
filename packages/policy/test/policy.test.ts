import type { Mandate, MarketContext } from "@custodia/schema";
import { MANDATE_DOMAIN, MANDATE_TYPES, constraintsHash } from "@custodia/schema";
import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import {
  evaluate,
  evaluatePolicyLimits,
  type MarketSnapshot,
  POLICY_MARKET_STALENESS_SECONDS,
  POLICY_MAX_DRAWDOWN_FLOOR_PCT,
  POLICY_MAX_TRADE_USD_CEILING,
  type PolicyState,
  validateMandateSignature,
  X402_MAX_HBAR_PER_TASK,
} from "../src/index.js";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

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

const makeHourly = (base = 2400) =>
  Array.from({ length: 24 }, (_, i) => ({ ts: i * 3600, close: base }));

const NOW = 1500;

const freshMarket: MarketContext = {
  pair: "ETH/USDC",
  priceUsd: 2400,
  realizedVol24hPct: 3.5,
  tvlUsd: 187_000_000,
  hourly: makeHourly(2400),
  block: 100,
  fetchedAt: NOW,
};

// ─── Suite 1: existing evaluate() — preserved ────────────────────────────────

describe("Policy Engine — evaluate()", () => {
  it("allows pay_x402 within budget", () => {
    const action = { kind: "pay_x402" as const, amountHbar: 0.5, endpoint: "http://test" };
    expect(evaluate(dummyMandate, action, defaultState).allowed).toBe(true);
  });

  it("denies pay_x402 over budget", () => {
    const action = {
      kind: "pay_x402" as const,
      amountHbar: X402_MAX_HBAR_PER_TASK + 0.1,
      endpoint: "http://test",
    };
    expect(evaluate(dummyMandate, action, defaultState).allowed).toBe(false);
  });

  it("denies expired mandate", () => {
    const action = { kind: "pay_x402" as const, amountHbar: 0.1, endpoint: "http://test" };
    expect(evaluate(dummyMandate, action, { ...defaultState, now: 2500 }).allowed).toBe(false);
  });

  it("denies max_trade_usd violation", () => {
    const mandate: Mandate = {
      ...dummyMandate,
      constraints: [{ type: "custodia.max_trade_usd.1", value: 1000 }],
    };
    const action = {
      kind: "rebalance" as const,
      fromAsset: "ETH",
      toAsset: "USDC",
      notionalUsd: 1500,
      reason: "test",
    };
    expect(evaluate(mandate, action, defaultState).allowed).toBe(false);
  });
});

// ─── Suite 2: validateMandateSignature ───────────────────────────────────────

describe("validateMandateSignature", () => {
  const PRIVATE_KEY =
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const account = privateKeyToAccount(PRIVATE_KEY);

  const mandateToSign: Mandate = {
    ...dummyMandate,
    owner: account.address,
    constraints: [{ type: "custodia.max_drawdown_pct.1", value: -15 }],
  };

  const signMandate = (mandate: Mandate) =>
    account.signTypedData({
      domain: MANDATE_DOMAIN,
      types: MANDATE_TYPES,
      primaryType: "Mandate",
      message: {
        kind: mandate.kind,
        taskId: mandate.taskId,
        owner: mandate.owner,
        agent: mandate.agent,
        ens: mandate.ens,
        constraintsHash: constraintsHash(mandate.constraints),
        iat: BigInt(mandate.iat),
        exp: BigInt(mandate.exp),
      },
    });

  it("allows a valid signature from the expected owner", async () => {
    const sig = await signMandate(mandateToSign);
    const decision = await validateMandateSignature(mandateToSign, sig, account.address);
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toContain(account.address);
  });

  it("denies when expectedOwner does not match the signer", async () => {
    const sig = await signMandate(mandateToSign);
    const wrongOwner = "0x0000000000000000000000000000000000000001";
    const decision = await validateMandateSignature(mandateToSign, sig, wrongOwner);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/does not match/i);
  });

  it("denies a malformed signature without throwing", async () => {
    const decision = await validateMandateSignature(
      mandateToSign,
      "0xdeadbeef" as `0x${string}`,
      account.address,
    );
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/error/i);
  });
});

// ─── Suite 3: evaluatePolicyLimits ───────────────────────────────────────────

describe("evaluatePolicyLimits", () => {
  it("allows a mandate within all bounds with fresh market data", () => {
    const mandate: Mandate = {
      ...dummyMandate,
      constraints: [
        { type: "custodia.max_drawdown_pct.1", value: -15 },
        { type: "custodia.max_trade_usd.1", value: 5_000 },
      ],
    };
    const decision = evaluatePolicyLimits(mandate, { market: freshMarket, now: NOW });
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toContain("Risk limits pass");
  });

  it("allows a mandate with no numeric constraints", () => {
    const decision = evaluatePolicyLimits(dummyMandate, { market: freshMarket, now: NOW });
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toContain("unconstrained");
  });

  it("denies stale market data", () => {
    const staleMarket: MarketContext = {
      ...freshMarket,
      fetchedAt: NOW - POLICY_MARKET_STALENESS_SECONDS - 1,
    };
    const decision = evaluatePolicyLimits(dummyMandate, { market: staleMarket, now: NOW });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/stale/i);
  });

  it("denies drawdown below the absolute floor", () => {
    const mandate: Mandate = {
      ...dummyMandate,
      constraints: [
        { type: "custodia.max_drawdown_pct.1", value: POLICY_MAX_DRAWDOWN_FLOOR_PCT - 1 },
      ],
    };
    const decision = evaluatePolicyLimits(mandate, { market: freshMarket, now: NOW });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/floor/i);
    expect(decision.violated).toBe("custodia.max_drawdown_pct.1");
  });

  it("denies trade size above the absolute ceiling", () => {
    const mandate: Mandate = {
      ...dummyMandate,
      constraints: [
        { type: "custodia.max_trade_usd.1", value: POLICY_MAX_TRADE_USD_CEILING + 1 },
      ],
    };
    const decision = evaluatePolicyLimits(mandate, { market: freshMarket, now: NOW });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/ceiling/i);
    expect(decision.violated).toBe("custodia.max_trade_usd.1");
  });

  it("denies drawdown tighter than realized 24h volatility", () => {
    const mandate: Mandate = {
      ...dummyMandate,
      constraints: [{ type: "custodia.max_drawdown_pct.1", value: -2 }],
    };
    const decision = evaluatePolicyLimits(mandate, { market: freshMarket, now: NOW });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/tighter than/i);
    expect(decision.violated).toBe("custodia.max_drawdown_pct.1");
  });
});
