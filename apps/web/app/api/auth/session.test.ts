import { privateKeyToAccount } from "viem/accounts";
import { afterEach, expect, it, vi } from "vitest";
import { createChallenge, readSessionToken, verifyChallenge } from "./session";

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const agent = `0x${"22".repeat(20)}` as `0x${string}`;
const conversationId = "00000000-0000-4000-8000-000000000002";

afterEach(() => vi.unstubAllEnvs());

it("verifies and consumes one wallet challenge for a conversation", async () => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  const challenge = createChallenge({
    address: account.address,
    agent,
    conversationId,
  });
  const signature = await account.signMessage({ message: challenge.message });
  const verified = await verifyChallenge({
    address: account.address,
    agent,
    conversationId,
    message: challenge.message,
    signature,
  });

  expect(verified.session.address).toBe(account.address);
  expect(readSessionToken(verified.token)).toMatchObject({
    address: account.address,
    agent,
    conversationId,
  });
  await expect(
    verifyChallenge({
      address: account.address,
      agent,
      conversationId,
      message: challenge.message,
      signature,
    }),
  ).rejects.toThrow("missing or expired");
});
