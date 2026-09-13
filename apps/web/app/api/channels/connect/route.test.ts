import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({})),
  bindChannel: vi.fn(async () => undefined),
  queueChannelMessage: vi.fn(async () => undefined),
}));

vi.mock("@custodia/db", () => ({ createDb: mocks.createDb }));
// Greetings come from the model in production; tests use the fixed text offline.
vi.mock("@custodia/agent", async (orig) => {
  const mod = await orig<typeof import("@custodia/agent")>();
  return {
    ...mod,
    generateWelcome: async (o: { paired: Parameters<typeof mod.staticWelcome>[0] }) =>
      mod.staticWelcome(o.paired),
  };
});
vi.mock("@custodia/runtime", () => ({
  bindChannel: mocks.bindChannel,
  queueChannelMessage: mocks.queueChannelMessage,
  describeIdentity: async () => "You don't have a CustodIA name yet",
}));

import { privateKeyToAccount } from "viem/accounts";
import { connectMessage, createConnectToken, readConnectToken } from "../pairing";
import { POST } from "./route";

const account = privateKeyToAccount(`0x${"b".repeat(64)}`);

const claimFor = (token: string) => {
  const claim = readConnectToken(token);
  if (!claim) throw new Error("expected a valid connect token");
  return claim;
};

beforeEach(() => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("TELEGRAM_BOT_USERNAME", "CustodiaTestBot");
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const call = (body: Record<string, string>) =>
  POST(
    new Request("https://app.test/api/channels/connect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

it("binds the chat account in the link to the wallet that signed the message", async () => {
  const { token } = createConnectToken("telegram", "777");

  const challenge = await call({ token, address: account.address });
  const { message } = await challenge.json();
  expect(message).toBe(connectMessage(claimFor(token), account.address));
  expect(mocks.bindChannel).not.toHaveBeenCalled();

  const signature = await account.signMessage({ message });
  const response = await call({ token, address: account.address, signature });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    wallet: account.address,
    channel: "telegram",
    chatUrl: "https://t.me/CustodiaTestBot",
  });
  expect(mocks.bindChannel).toHaveBeenCalledWith(
    {},
    { channel: "telegram", externalId: "777", ownerWallet: account.address },
  );
  expect(mocks.queueChannelMessage).toHaveBeenCalledWith(
    {},
    { channel: "telegram", chatId: "777" },
    expect.stringContaining(account.address),
  );
});

it("refuses a signature from another wallet or for another chat account", async () => {
  const { token } = createConnectToken("telegram", "777");
  const other = createConnectToken("telegram", "888").token;
  const message = connectMessage(claimFor(token), account.address);
  const signature = await account.signMessage({ message });

  const intruder = privateKeyToAccount(`0x${"c".repeat(64)}`);
  expect((await call({ token, address: intruder.address, signature })).status).toBe(401);
  expect((await call({ token: other, address: account.address, signature })).status).toBe(401);
  expect(mocks.bindChannel).not.toHaveBeenCalled();
});

it("refuses tampered and expired links", async () => {
  const { token } = createConnectToken("whatsapp", "34600111222");
  const [body, tag] = token.split(".");
  const forged = `${Buffer.from(JSON.stringify({ c: "whatsapp", e: "34600999999", x: Date.now() + 60_000 })).toString("base64url")}.${tag}`;

  expect(readConnectToken(token)?.externalId).toBe("34600111222");
  expect(readConnectToken(forged)).toBeNull();
  expect(readConnectToken(`${body}.${tag}.x`)).toBeNull();
  expect(readConnectToken(token, Date.now() + 16 * 60 * 1_000)).toBeNull();
  expect((await call({ token: forged, address: account.address })).status).toBe(401);
});
