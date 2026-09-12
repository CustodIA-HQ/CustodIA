import { privateKeyToAccount } from "viem/accounts";
import { afterEach, expect, it, vi } from "vitest";
import { createChallenge, readSessionToken, verifyChallenge } from "./session";

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const agent = `0x${"22".repeat(20)}` as `0x${string}`;
const conversationId = "00000000-0000-4000-8000-000000000002";

afterEach(() => vi.unstubAllEnvs());

it("verifies a wallet challenge and rejects tampered or foreign ones", async () => {
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
  // Challenges are stateless (HMAC-derived), so a tampered message must fail
  // even though it carries a valid-looking structure.
  await expect(
    verifyChallenge({
      address: account.address,
      agent,
      conversationId,
      message: challenge.message.replace("Nonce: ", "Nonce: 0"),
      signature,
    }),
  ).rejects.toThrow("does not match");

  // …and a challenge issued for another conversation cannot be replayed here.
  await expect(
    verifyChallenge({
      address: account.address,
      agent,
      conversationId: "00000000-0000-4000-8000-000000000003",
      message: challenge.message,
      signature,
    }),
  ).rejects.toThrow("does not match");
});

it("rejects a replayed challenge when the store has consumed it", async () => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  const seen = new Set<string>();
  const store = {
    consume: async (nonce: string) => {
      if (seen.has(nonce)) return false;
      seen.add(nonce);
      return true;
    },
  };
  const challenge = createChallenge({ address: account.address, agent, conversationId });
  const signature = await account.signMessage({ message: challenge.message });
  const params = {
    address: account.address,
    agent,
    conversationId,
    message: challenge.message,
    signature,
    store,
  };
  await expect(verifyChallenge(params)).resolves.toBeTruthy();
  await expect(verifyChallenge(params)).rejects.toThrow("already been used");
});
