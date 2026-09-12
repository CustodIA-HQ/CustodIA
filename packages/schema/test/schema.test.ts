import { describe, expect, it } from "vitest";
import { MarketPairSchema, UISpecSchema } from "../src/index.js";

describe("MarketPairSchema", () => {
  it("accepts every asset combination and rejects unknown pairs", () => {
    expect(MarketPairSchema.parse("ETH/BTC")).toBe("ETH/BTC");
    expect(MarketPairSchema.parse("BTC/ETH")).toBe("BTC/ETH");
    expect(MarketPairSchema.parse("LINK/USDC")).toBe("LINK/USDC");
    expect(() => MarketPairSchema.parse("ETH/ETH")).toThrow();
    expect(() => MarketPairSchema.parse("PEPE/USDC")).toThrow();
  });
});

describe("UISpecSchema Boundaries", () => {
  it("should accept a valid UISpec", () => {
    const validSpec = {
      intent: "configure_portfolio_guard",
      rationale: "Testing valid spec",
      components: [
        {
          type: "range_slider",
          id: "max_drawdown_pct",
          min: 0.1,
          max: 5,
          default: 2,
        },
      ],
    };
    expect(() => UISpecSchema.parse(validSpec)).not.toThrow();
  });

  it("should reject an empty components array", () => {
    const invalidSpec = {
      intent: "configure_portfolio_guard",
      rationale: "Empty components",
      components: [],
    };
    expect(() => UISpecSchema.parse(invalidSpec)).toThrow();
  });

  it("accepts a position-protection spec with knobs and payoff", () => {
    const spec = {
      intent: "configure_position_protection",
      rationale: "Protect the ETH position",
      components: [
        {
          type: "protection_knobs",
          deductiblePct: 15,
          durationDays: 30,
          budgetUsd: 40,
          strikeUsd: 2125,
          spotUsd: 2500,
        },
        {
          type: "payoff_chart",
          spotUsd: 2500,
          strikeUsd: 2125,
          premiumUsd: 40,
          notionalUsd: 1000,
          points: Array.from({ length: 8 }, (_, i) => ({
            priceUsd: 1500 + i * 200,
            unprotectedUsd: i * 10,
            protectedUsd: i * 8,
          })),
        },
      ],
    };
    expect(() => UISpecSchema.parse(spec)).not.toThrow();
  });

  it("should reject an unknown component type", () => {
    const invalidSpec = {
      intent: "configure_portfolio_guard",
      rationale: "Malicious component injection",
      components: [
        {
          type: "malicious_script",
          code: "alert(1)",
        },
      ],
    };
    expect(() => UISpecSchema.parse(invalidSpec)).toThrow();
  });

  it("should reject invalid range_slider values due to strict typing (if they were strings)", () => {
    const invalidSpec = {
      intent: "configure_portfolio_guard",
      rationale: "Invalid types",
      components: [
        {
          type: "range_slider",
          id: "max_drawdown_pct",
          min: "0.1", // invalid, should be number
          max: 5,
          default: 2,
        },
      ],
    };
    expect(() => UISpecSchema.parse(invalidSpec)).toThrow();
  });
});
