import { describe, expect, it } from "vitest";
import { UISpecSchema } from "../src/index.js";

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
