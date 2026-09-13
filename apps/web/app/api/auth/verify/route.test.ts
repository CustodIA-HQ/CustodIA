import { NotImplementedError } from "@custodia/schema";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock("@custodia/db", () => ({ createDb: () => ({}), PostgresChallengeStore: class {} }));
vi.mock("@custodia/runtime", () => ({ getStoredUserLabel: vi.fn() }));
vi.mock("../../identity", () => ({
  getAgentAddress: () => "0x1111111111111111111111111111111111111111",
}));
vi.mock("../session", () => ({
  verifyChallenge: mocks.verify,
  AuthError: class extends Error {},
  SESSION_COOKIE_NAME: "custodia_session",
  SESSION_TTL_SECONDS: 14400,
}));

import { AuthError } from "../session";
import { POST } from "./route";

const request = () =>
  new Request("http://localhost/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({
      address: "0x1111111111111111111111111111111111111111",
      conversationId: "00000000-0000-4000-8000-000000000001",
      message: "challenge",
      signature: "0x1234",
    }),
  });
afterEach(() => vi.restoreAllMocks());
it("reports a database outage as a temporary service failure without exposing its details", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.verify.mockRejectedValue(new Error("database internal detail"));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: "Sign-in is temporarily unavailable. Try again in a moment.",
  });
  expect(response.headers.get("set-cookie")).toBeNull();
});
it("preserves authentication failures as 401", async () => {
  mocks.verify.mockRejectedValue(new AuthError("Signature rejected"));
  expect((await POST(request())).status).toBe(401);
});
it("preserves missing configuration as 503", async () => {
  mocks.verify.mockRejectedValue(new NotImplementedError("DATABASE_URL"));
  expect((await POST(request())).status).toBe(503);
});
