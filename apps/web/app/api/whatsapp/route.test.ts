import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({})),
  privateKeyToAccount: vi.fn(() => ({ address: "0x1111111111111111111111111111111111111111" })),
  createRun: vi.fn(async () => ({ runId: "run-1", created: true })),
  enqueueJob: vi.fn(async () => ({ jobId: 1, created: true })),
  findChannelBinding: vi.fn(async (): Promise<string | null> => null),
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
  createRun: mocks.createRun,
  enqueueJob: mocks.enqueueJob,
  findChannelBinding: mocks.findChannelBinding,
  bindChannel: mocks.bindChannel,
  queueChannelMessage: mocks.queueChannelMessage,
}));
vi.mock("viem/accounts", () => ({ privateKeyToAccount: mocks.privateKeyToAccount }));

import { createPairingCode, readConnectToken } from "../channels/pairing";
import { GET, POST } from "./route";

const wallet = "0x2222222222222222222222222222222222222222" as const;
const from = "34600111222";
const target = { channel: "whatsapp", chatId: from };

beforeEach(() => {
  vi.stubEnv("WHATSAPP_APP_SECRET", "app-secret");
  vi.stubEnv("WHATSAPP_VERIFY_TOKEN", "verify-me");
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("APP_URL", "https://app.test");
  vi.stubEnv("AGENT_PRIVATE_KEY", `0x${"a".repeat(64)}`);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const webhook = (text: string, opts: { signature?: string } = {}) => {
  const raw = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "waba",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              messages: [{ from, id: "wamid.1", type: "text", text: { body: text } }],
            },
          },
        ],
      },
    ],
  });
  const signature =
    opts.signature ?? `sha256=${createHmac("sha256", "app-secret").update(raw).digest("hex")}`;
  return POST(
    new Request("https://app.test/api/whatsapp", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": signature },
      body: raw,
    }),
  );
};

it("answers Meta's verification handshake only with the verify token", async () => {
  const ok = await GET(
    new Request(
      "https://app.test/api/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=42",
    ),
  );
  expect(await ok.text()).toBe("42");
  const bad = await GET(
    new Request(
      "https://app.test/api/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=42",
    ),
  );
  expect(bad.status).toBe(403);
});

it("rejects a payload without a valid Meta signature", async () => {
  const response = await webhook("hello", { signature: "sha256=00" });
  expect(response.status).toBe(401);
  expect(mocks.findChannelBinding).not.toHaveBeenCalled();
});

it("sends an unpaired number to connect its wallet through the outbox", async () => {
  const response = await webhook("guard my eth");
  expect(response.status).toBe(200);
  expect(mocks.queueChannelMessage).toHaveBeenCalledWith(
    {},
    target,
    expect.stringContaining("https://app.test/connect?t="),
  );
  const text = String((mocks.queueChannelMessage.mock.calls[0] as unknown[])[2]);
  const token = new URL(text.match(/https:\/\/\S+/)?.[0] ?? "").searchParams.get("t") ?? "";
  expect(readConnectToken(token)).toMatchObject({ channel: "whatsapp", externalId: from });
  expect(mocks.createRun).not.toHaveBeenCalled();
});

it("pairs the number from a CONNECT code and refuses a Telegram code", async () => {
  await webhook(`CONNECT ${createPairingCode("whatsapp", wallet).code}`);
  expect(mocks.bindChannel).toHaveBeenCalledWith(
    {},
    { channel: "whatsapp", externalId: from, ownerWallet: wallet },
  );

  mocks.bindChannel.mockClear();
  await webhook(`CONNECT ${createPairingCode("telegram", wallet).code}`);
  expect(mocks.bindChannel).not.toHaveBeenCalled();
});

it("queues a paired number's message as a chat run", async () => {
  mocks.findChannelBinding.mockResolvedValueOnce(wallet);
  await webhook("Protect me if ETH drops 15%");
  expect(mocks.createRun).toHaveBeenCalledWith(
    {},
    {
      conversationId: `whatsapp:${from}`,
      ownerWallet: wallet,
      kind: "chat",
      clientRequestId: "whatsapp:wamid.1",
      input: {
        messages: [{ role: "user", content: "Protect me if ETH drops 15%" }],
        agent: "0x1111111111111111111111111111111111111111",
        reply: target,
      },
    },
  );
  expect(mocks.enqueueJob).toHaveBeenCalledWith(
    {},
    { kind: "chat.run", payload: { runId: "run-1" }, dedupeKey: "chat.run:run-1" },
  );
  expect(mocks.queueChannelMessage).toHaveBeenCalledWith({}, target, "Working on it…");
});
