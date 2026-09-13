import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createDb: vi.fn(() => ({})),
  privateKeyToAccount: vi.fn(() => ({ address: "0x1111111111111111111111111111111111111111" })),
  createRun: vi.fn(async () => ({ runId: "run-1", created: true })),
  enqueueJob: vi.fn(async () => ({ jobId: 1, created: true })),
  findChannelBinding: vi.fn(async (): Promise<string | null> => null),
  bindChannel: vi.fn(async () => undefined),
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
}));
vi.mock("viem/accounts", () => ({ privateKeyToAccount: mocks.privateKeyToAccount }));

import { createPairingCode, readConnectToken, readPairingCode } from "../channels/pairing";
import { POST } from "./route";

const wallet = "0x2222222222222222222222222222222222222222" as const;

beforeEach(() => {
  vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "hook-secret");
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("APP_URL", "https://app.test");
  vi.stubEnv("AGENT_PRIVATE_KEY", `0x${"a".repeat(64)}`);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

const update = (
  text: string,
  opts: { secret?: string; chatType?: string; updateId?: number } = {},
) =>
  POST(
    new Request("https://app.test/api/telegram", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": opts.secret ?? "hook-secret",
      },
      body: JSON.stringify({
        update_id: opts.updateId ?? 100,
        message: {
          message_id: 1,
          chat: { id: 555, type: opts.chatType ?? "private" },
          from: { id: 777 },
          text,
        },
      }),
    }),
  );

it("rejects an update without the webhook secret", async () => {
  const response = await update("hello", { secret: "wrong" });
  expect(response.status).toBe(403);
  expect(mocks.createRun).not.toHaveBeenCalled();
});

it("sends an unpaired user a wallet verification link and enqueues nothing", async () => {
  for (const text of ["guard my eth", "/start"]) {
    const response = await update(text);
    const body = await response.json();
    expect(body).toMatchObject({ method: "sendMessage", chat_id: 555 });
    const token = new URL(body.text.match(/https:\/\/\S+/)[0]).searchParams.get("t") ?? "";
    expect(body.text).toContain("https://app.test/connect?t=");
    expect(readConnectToken(token)).toMatchObject({ channel: "telegram", externalId: "777" });
  }
  expect(mocks.createRun).not.toHaveBeenCalled();
  expect(mocks.bindChannel).not.toHaveBeenCalled();
});

it("pairs the Telegram user with the wallet in a valid start code", async () => {
  const { code } = createPairingCode("telegram", wallet);
  const response = await update(`/start ${code}`);
  expect(mocks.bindChannel).toHaveBeenCalledWith(
    {},
    { channel: "telegram", externalId: "777", ownerWallet: wallet },
  );
  expect((await response.json()).text).toMatch(/verified as 0x2222/);
});

it("refuses a tampered or expired pairing code", () => {
  const { code } = createPairingCode("telegram", wallet);
  const tampered = `${code.slice(0, -2)}${code.endsWith("AA") ? "BB" : "AA"}`;
  expect(readPairingCode("telegram", code)).toBe(wallet);
  expect(readPairingCode("telegram", tampered)).toBeNull();
  expect(readPairingCode("telegram", code, Date.now() + 11 * 60 * 1_000)).toBeNull();
  // A Telegram code cannot pair a WhatsApp number.
  expect(readPairingCode("whatsapp", code)).toBeNull();
  expect(code.length).toBeLessThanOrEqual(64);
});

it("queues a paired user's message as a chat run and acknowledges immediately", async () => {
  mocks.findChannelBinding.mockResolvedValueOnce(wallet);
  const response = await update("Protect me if ETH drops 15%");
  expect(mocks.createRun).toHaveBeenCalledWith(
    {},
    {
      conversationId: "telegram:555",
      ownerWallet: wallet,
      kind: "chat",
      clientRequestId: "telegram:100",
      input: {
        messages: [{ role: "user", content: "Protect me if ETH drops 15%" }],
        agent: "0x1111111111111111111111111111111111111111",
        reply: { channel: "telegram", chatId: "555" },
      },
    },
  );
  expect(mocks.enqueueJob).toHaveBeenCalledWith(
    {},
    { kind: "chat.run", payload: { runId: "run-1" }, dedupeKey: "chat.run:run-1" },
  );
  expect((await response.json()).text).toBe("Working on it…");
});

it("does not enqueue twice when Telegram redelivers the same update", async () => {
  mocks.findChannelBinding.mockResolvedValueOnce(wallet);
  mocks.createRun.mockResolvedValueOnce({ runId: "run-1", created: false });
  const response = await update("Protect me if ETH drops 15%");
  expect(response.status).toBe(200);
  expect(mocks.enqueueJob).not.toHaveBeenCalled();
});

it("ignores group chats", async () => {
  const response = await update("guard my eth", { chatType: "group" });
  expect(response.status).toBe(200);
  expect(mocks.findChannelBinding).not.toHaveBeenCalled();
});
