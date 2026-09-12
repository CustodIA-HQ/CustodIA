import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listEvents: vi.fn(async () => [
    { seq: 1, stage: "fetching_context", type: "stage", payload: null, createdAt: new Date() },
  ]),
  loadRun: vi.fn(),
}));
vi.mock("@custodia/db", () => ({ createDb: () => ({}), tables: {} }));
vi.mock("@custodia/runtime", () => ({ listEvents: mocks.listEvents, loadRun: mocks.loadRun }));

import { createSessionToken, SESSION_COOKIE_NAME } from "../../../auth/session";
import { GET } from "./route";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const owner = "0x2222222222222222222222222222222222222222";
const cookie = () => {
  vi.stubEnv("SESSION_SECRET", "s");
  return `${SESSION_COOKIE_NAME}=${createSessionToken({
    address: owner,
    agent: "0x1111111111111111111111111111111111111111",
    conversationId: "c1",
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  })}`;
};
const params = { params: Promise.resolve({ id: "run-1" }) };

it("returns events after a cursor for the run owner", async () => {
  mocks.loadRun.mockResolvedValue({
    id: "run-1",
    ownerWallet: owner,
    conversationId: "c1",
    status: "running",
  });
  const res = await GET(
    new Request("http://x/api/runs/run-1/events?after=0", { headers: { cookie: cookie() } }),
    params,
  );
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({
    runId: "run-1",
    status: "running",
    events: [{ seq: 1 }],
  });
  expect(mocks.listEvents).toHaveBeenCalledWith(expect.anything(), "run-1", 0);
});

it("hides runs from other wallets", async () => {
  mocks.loadRun.mockResolvedValue({
    id: "run-1",
    ownerWallet: "0x3333333333333333333333333333333333333333",
    conversationId: "c1",
    status: "running",
  });
  const res = await GET(
    new Request("http://x/api/runs/run-1/events", { headers: { cookie: cookie() } }),
    params,
  );
  expect(res.status).toBe(404);
});

it("requires a session", async () => {
  const res = await GET(new Request("http://x/api/runs/run-1/events"), params);
  expect(res.status).toBe(401);
});
