import { expect, it } from "vitest";
import { composeNeedsHuman, composeUISpec } from "./compose.js";
import { classifyIntent } from "./router.js";

const market = {
  pair: "ETH/USDC" as const,
  base: "ETH",
  quote: "USDC",
  poolId: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
  poolName: "Uniswap V3 USD Coin/Wrapped Ether 0.05%",
  priceUsd: 2500,
  realizedVol24hPct: 6,
  tvlUsd: 100_000,
  hourly: Array.from({ length: 24 }, (_, i) => ({ ts: i, close: 2500 })),
  block: 1,
  fetchedAt: 1,
};
const risk = {
  volatility24hPct: 6,
  concentrationPct: 60,
  maxTradeEnvelopeUsd: 400,
  drawdownRange: [3, 12] as [number, number],
  explanation: "fixture",
};

it("classifies protection, collateral, spot and futures separately from the portfolio guard", () => {
  expect(classifyIntent("Protect me if ETH drops more than 15%")).toBe("protect");
  expect(classifyIntent("Protect my collateral if health factor approaches 1.35")).toBe(
    "collateral",
  );
  expect(classifyIntent("Buy 500 USDC of ETH")).toBe("execute");
  expect(classifyIntent("Open a small ETH future")).toBe("futures");
  expect(classifyIntent("Cap drawdown at 5%")).toBe("guard");
  expect(classifyIntent("What is ETH doing today?")).toBe("research");
  expect(classifyIntent("Trade perps on mainnet")).toBe("unsupported");
});

it("composes a protection spec with knobs and a payoff chart", () => {
  const spec = composeUISpec({
    intent: "protect",
    market,
    risk,
    portfolio: { eth: "2", usdc: "1000" },
    message: "Protect me if ETH drops more than 15%",
    receiptTxId: "r1",
  });
  expect(spec?.intent).toBe("configure_position_protection");
  expect(spec?.components.some((c) => c.type === "payoff_chart")).toBe(true);
  const knobs = spec?.components.find((c) => c.type === "protection_knobs");
  expect(knobs?.type === "protection_knobs" && knobs.deductiblePct).toBe(15);
});

it("blocks a spot trade outside the envelope", () => {
  const spec = composeUISpec({
    intent: "execute",
    market,
    risk,
    portfolio: { eth: "2", usdc: "1000" },
    message: "Buy 50000 USDC of ETH",
  });
  expect(spec?.intent).toBe("needs_human");
});

it("keeps futures leverage off and a stop required", () => {
  const spec = composeUISpec({
    intent: "futures",
    market,
    risk,
    portfolio: { eth: "1", usdc: "0" },
    message: "Open a small ETH future",
  });
  const leverage = spec?.components.find((c) => c.type === "leverage_control");
  expect(leverage?.type === "leverage_control" && leverage.enabled).toBe(false);
  expect(leverage?.type === "leverage_control" && leverage.stopRequired).toBe(true);
});

it("builds a needs-human escalation card", () => {
  const spec = composeNeedsHuman("buy $50k ETH", "Outside envelope");
  expect(spec.intent).toBe("needs_human");
});

it("sizes protection for an empty wallet on the risk envelope, never a $1 placeholder", () => {
  const spec = composeUISpec({
    intent: "protect",
    market,
    risk,
    portfolio: { eth: "0", usdc: "0" },
    message: "Protect me if ETH drops more than 15%",
  });
  const payoff = spec?.components.find((c) => c.type === "payoff_chart");
  expect(payoff?.type === "payoff_chart" && payoff.notionalUsd).toBe(400);
  expect(payoff?.type === "payoff_chart" && payoff.spotUsd).toBe(2500);
  expect(spec?.rationale).toContain("risk envelope");
});

it("composes no protection when there are neither holdings nor a risk envelope", () => {
  const spec = composeUISpec({
    intent: "protect",
    market,
    risk: null,
    portfolio: { eth: "0", usdc: "0" },
    message: "Protect me if ETH drops more than 15%",
  });
  expect(spec).toBeNull();
});

it("prices the futures preview from pool depth, not a fixed slippage", () => {
  const spec = composeUISpec({
    intent: "futures",
    market,
    risk,
    portfolio: { eth: "1", usdc: "0" },
    message: "Open a small ETH future",
  });
  const preview = spec?.components.find((c) => c.type === "execution_preview");
  // $100 against $100k TVL = 10 bps; buy fills above spot.
  expect(preview?.type === "execution_preview" && preview.slippageBps).toBe(10);
  expect(preview?.type === "execution_preview" && preview.expectedPriceUsd).toBe(2502.5);
});
