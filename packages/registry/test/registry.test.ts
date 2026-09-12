import { expect, it } from "vitest";
import {
  coverageFor,
  getCapability,
  listCapabilities,
  NATIVE_ETH,
  SEPOLIA_USDC,
} from "../src/index.js";

it("seeds Sepolia ETH, WETH and Circle USDC", () => {
  const caps = listCapabilities();
  expect(caps.map((c) => c.symbol).sort()).toEqual(["ETH", "USDC", "WETH"]);
  expect(getCapability(SEPOLIA_USDC)?.status).toBe("evaluable");
  expect(getCapability(NATIVE_ETH)?.native).toBe(true);
});

it("marks unknown contracts as not covered", () => {
  const unknown = "0x000000000000000000000000000000000000dEaD";
  const { supported, unsupported } = coverageFor([NATIVE_ETH, unknown]);
  expect(supported).toContain("eip155:11155111:eth");
  expect(unsupported[0]?.reason).toMatch(/registry/i);
});
