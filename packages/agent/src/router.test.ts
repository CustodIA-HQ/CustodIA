import { expect, it } from "vitest";
import { classifyIntent } from "./router.js";

it("routes holdings, evaluate, guard and unsupported intents", () => {
  expect(classifyIntent("Show my Sepolia portfolio")).toBe("holdings");
  expect(classifyIntent("Compare ETH and USDC allocations")).toBe("evaluate");
  expect(classifyIntent("Keep $10k in ETH/USDC, max 5% drawdown")).toBe("guard");
  expect(classifyIntent("Trade perps on mainnet")).toBe("unsupported");
  expect(classifyIntent("Protect me if ETH drops more than 15%")).toBe("protect");
  expect(classifyIntent("What is ETH doing today?")).toBe("research");
  expect(classifyIntent("How is the weather")).toBe("research");
});
