import { expect, it } from "vitest";
import { parseOrder } from "./actions.js";

it("parses unmistakable orders and nothing else", () => {
  expect(parseOrder("swap 0.01 eth to usdc")).toEqual({ sell: "ETH", buy: "USDC", amount: 0.01 });
  expect(parseOrder("Sell 0.5 ETH")).toEqual({ sell: "ETH", buy: "USDC", amount: 0.5 });
  expect(parseOrder("swap 25 USDC for ETH")).toEqual({ sell: "USDC", buy: "ETH", amount: 25 });
  expect(parseOrder("convert 10 usdc into eth please")).toEqual({
    sell: "USDC",
    buy: "ETH",
    amount: 10,
  });
  expect(parseOrder("buy 0.02 ETH with USDC")).toEqual({
    sell: "USDC",
    buy: "ETH",
    amount: 0.02,
    exactOutput: true,
  });
  expect(parseOrder("vende 0.1 eth")).toEqual({ sell: "ETH", buy: "USDC", amount: 0.1 });
  // not orders
  expect(parseOrder("swap eth to eth")).toBeNull();
  expect(parseOrder("should I sell my ETH?")).toBeNull();
  expect(parseOrder("what is eth doing")).toBeNull();
  expect(parseOrder("swap 0.01 eth to eth")).toBeNull();
});
