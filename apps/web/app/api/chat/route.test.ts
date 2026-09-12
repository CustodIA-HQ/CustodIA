import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({})),
  privateKeyToAccount: vi.fn(() => ({
    address: "0x1111111111111111111111111111111111111111",
  })),
  runAgent: vi.fn(),
  createRun: vi.fn(async () => ({ runId: "run-1", created: true })),
  enqueueJob: vi.fn(async () => ({ jobId: 1, created: true })),
}));

vi.mock("@custodia/agent", () => ({ runAgent: mocks.runAgent }));
vi.mock("@custodia/runtime", () => ({ createRun: mocks.createRun, enqueueJob: mocks.enqueueJob }));
vi.mock("@custodia/db", () => ({
  createDb: mocks.createDb,
  PostgresMarketCache: class {},
}));
vi.mock("viem/accounts", () => ({ privateKeyToAccount: mocks.privateKeyToAccount }));

import { createSessionToken, SESSION_COOKIE_NAME } from "../auth/session";
import { POST } from "./route";

const conversationId = "00000000-0000-4000-8000-000000000001";
const owner = "0x2222222222222222222222222222222222222222" as const;
const agent = "0x1111111111111111111111111111111111111111" as const;

const sessionCookie = () => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  return `${SESSION_COOKIE_NAME}=${createSessionToken({
    address: owner,
    agent,
    conversationId,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  })}`;
};

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

it("rejects malformed chat input before dispatching to the agent", async () => {
  const response = await POST(
    new Request("https://example.com/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }),
  );

  expect(response.status).toBe(400);
  expect(mocks.runAgent).not.toHaveBeenCalled();
});

it("persists the request as a run and returns 202 with the run id", async () => {
  const res = await POST(
    new Request("http://x/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie() },
      body: JSON.stringify({
        conversationId,
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        message: "guard my eth",
      }),
    }),
  );
  expect(res.status).toBe(202);
  expect(await res.json()).toEqual({ runId: "run-1", created: true });
  expect(mocks.createRun).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      conversationId,
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      ownerWallet: owner,
      kind: "chat",
    }),
  );
  expect(mocks.enqueueJob).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ kind: "chat.run", dedupeKey: "chat.run:run-1" }),
  );
  expect(mocks.runAgent).not.toHaveBeenCalled();
});

it("does not enqueue twice for a duplicate delivery", async () => {
  mocks.createRun.mockResolvedValueOnce({ runId: "run-1", created: false });
  const res = await POST(
    new Request("http://x/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: sessionCookie() },
      body: JSON.stringify({
        conversationId,
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        message: "guard my eth",
      }),
    }),
  );
  expect(res.status).toBe(202);
  expect(await res.json()).toEqual({ runId: "run-1", created: false });
  expect(mocks.enqueueJob).not.toHaveBeenCalled();
});

it("reports missing agent identity as a service configuration error", async () => {
  vi.stubEnv("AGENT_PRIVATE_KEY", "");
  const cookie = sessionCookie();

  const response = await POST(
    new Request("https://example.com/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        conversationId,
        clientRequestId: "11111111-1111-4111-8111-111111111111",
        message: "What can you protect?",
      }),
    }),
  );

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: "Not implemented: AGENT_PRIVATE_KEY (agent identity)",
  });
  expect(mocks.runAgent).not.toHaveBeenCalled();
});
