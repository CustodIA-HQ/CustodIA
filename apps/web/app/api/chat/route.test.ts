import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({})),
  privateKeyToAccount: vi.fn(() => ({
    address: "0x1111111111111111111111111111111111111111",
  })),
  runAgent: vi.fn(),
}));

vi.mock("@custodia/agent", () => ({ runAgent: mocks.runAgent }));
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

it("dispatches a valid prompt and returns the agent result", async () => {
  vi.stubEnv("AGENT_PRIVATE_KEY", `0x${"1".repeat(64)}`);
  const cookie = sessionCookie();
  mocks.runAgent.mockResolvedValue({
    market: null,
    uiSpec: null,
    receipts: [],
    rationale: "A bounded portfolio guard is ready to review.",
  });

  const response = await POST(
    new Request("https://example.com/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ conversationId, message: "Keep $10k in ETH/USDC" }),
    }),
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    message: "A bounded portfolio guard is ready to review.",
    receipts: [],
  });
  expect(mocks.runAgent).toHaveBeenCalledWith(
    expect.objectContaining({
      agent: "0x1111111111111111111111111111111111111111",
      owner,
      messages: [{ role: "user", content: "Keep $10k in ETH/USDC" }],
    }),
  );
});

it("reports missing agent identity as a service configuration error", async () => {
  vi.stubEnv("AGENT_PRIVATE_KEY", "");
  const cookie = sessionCookie();

  const response = await POST(
    new Request("https://example.com/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ conversationId, message: "What can you protect?" }),
    }),
  );

  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: "Not implemented: AGENT_PRIVATE_KEY (agent identity)",
  });
  expect(mocks.runAgent).not.toHaveBeenCalled();
});
