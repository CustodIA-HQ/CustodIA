import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMarketContext: vi.fn(),
  getMarketContexts: vi.fn(),
  createDb: vi.fn(() => ({})),
}));

vi.mock("@custodia/graph", () => ({
  getMarketContext: mocks.getMarketContext,
  getMarketContexts: mocks.getMarketContexts,
}));
vi.mock("@custodia/db", () => ({
  createDb: mocks.createDb,
  PostgresMarketCache: class {},
}));

import { GET } from "./route";

afterEach(() => {
  vi.clearAllMocks();
});

const hourly = Array.from({ length: 30 }, (_, index) => ({
  ts: 1_700_000_000 + index * 3600,
  close: 2500 + index,
}));

const ethUsdc = {
  pair: "ETH/USDC" as const,
  base: "ETH",
  quote: "USDC",
  poolId: "0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640",
  poolName: "Uniswap V3 USD Coin/Wrapped Ether 0.05%",
  priceUsd: 2529,
  realizedVol24hPct: 6.1,
  tvlUsd: 109_000_000,
  hourly,
  block: 22_000_000,
  fetchedAt: Date.now(),
};

it("does not claim live data when Graph is unavailable", async () => {
  mocks.getMarketContexts.mockRejectedValueOnce(new Error("GRAPH_STUDIO_KEY missing"));
  const response = await GET(new Request("http://localhost/api/market"));
  const body = (await response.json()) as { live?: boolean; error?: string };
  expect(response.status).toBe(503);
  expect(body.live).toBe(false);
  expect(body.error).toMatch(/GRAPH_STUDIO_KEY/);
});

it("returns every compatible venue that the Graph path could assemble", async () => {
  mocks.getMarketContexts.mockResolvedValueOnce([
    ethUsdc,
    {
      ...ethUsdc,
      pair: "ETH/BTC",
      base: "ETH",
      quote: "BTC",
      poolId: "derived:ETH/BTC",
      poolName: "Derived ETH/BTC from USD legs",
      priceUsd: 2529,
    },
  ]);
  const response = await GET(new Request("http://localhost/api/market"));
  const body = (await response.json()) as {
    live?: boolean;
    market?: { pair: string; hourly: unknown[] };
    markets?: Array<{ pair: string }>;
  };
  expect(response.status).toBe(200);
  expect(body.live).toBe(true);
  expect(body.market?.pair).toBe("ETH/USDC");
  expect(body.market?.hourly.length).toBeGreaterThanOrEqual(24);
  expect(body.markets?.map((row) => row.pair)).toEqual(["ETH/USDC", "ETH/BTC"]);
});

it("rejects an unsupported pair without calling Graph", async () => {
  const response = await GET(new Request("http://localhost/api/market?pair=PEPE/USDC"));
  expect(response.status).toBe(400);
  expect(mocks.getMarketContext).not.toHaveBeenCalled();
});
