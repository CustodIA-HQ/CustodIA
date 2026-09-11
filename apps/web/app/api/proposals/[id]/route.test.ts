import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadProposal: vi.fn() }));
vi.mock("@custodia/db", () => ({ createDb: () => ({}) }));
vi.mock("@custodia/runtime", () => ({ loadProposal: mocks.loadProposal }));

import { createSessionToken, SESSION_COOKIE_NAME } from "../../auth/session";
import { GET } from "./route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});
const owner = "0x2222222222222222222222222222222222222222";
const cookie = () => {
  vi.stubEnv("SESSION_SECRET", "s");
  return `${SESSION_COOKIE_NAME}=${createSessionToken({ address: owner, agent: "0x1111111111111111111111111111111111111111", conversationId: "c1", issuedAt: Date.now(), expiresAt: Date.now() + 60_000 })}`;
};
const params = { params: Promise.resolve({ id: "p1" }) };

it("returns the stored proposal body to its owner", async () => {
  mocks.loadProposal.mockResolvedValue({
    id: "p1",
    hash: "0xh",
    taskId: "t1",
    ownerWallet: owner,
    body: { market: { pair: "ETH/USDC" }, uiSpec: { components: [] }, proposal: { taskId: "t1" } },
  });
  const res = await GET(
    new Request("http://x/api/proposals/p1", { headers: { cookie: cookie() } }),
    params,
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ id: "p1", hash: "0xh", market: { pair: "ETH/USDC" } });
});

it("hides other wallets' proposals", async () => {
  mocks.loadProposal.mockResolvedValue({
    id: "p1",
    ownerWallet: "0x3333333333333333333333333333333333333333",
    body: {},
  });
  const res = await GET(
    new Request("http://x/api/proposals/p1", { headers: { cookie: cookie() } }),
    params,
  );
  expect(res.status).toBe(404);
});
