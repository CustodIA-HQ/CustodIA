import { createTestDb, tables } from "@custodia/db";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  bindChannel,
  channelReplyText,
  findChannelBinding,
  queueChannelReply,
  sendWhatsAppMessage,
} from "./channels.js";
import { notifyHandler } from "./handlers/notify.js";
import { leaseJob } from "./jobs.js";
import { HandlerRegistry, tick } from "./registry.js";
import { completeRun, createRun } from "./runs.js";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("pairs, re-pairs and resolves a Telegram identity", async () => {
  expect(await findChannelBinding(ctx.db, "telegram", "42")).toBeNull();
  await bindChannel(ctx.db, { channel: "telegram", externalId: "42", ownerWallet: "0xa" });
  await bindChannel(ctx.db, { channel: "telegram", externalId: "42", ownerWallet: "0xb" });
  expect(await findChannelBinding(ctx.db, "telegram", "42")).toBe("0xb");
});

it("answers with the rationale and a web link when a task needs a signature", () => {
  expect(
    channelReplyText(
      { status: "done", output: { rationale: "Guard ready.", taskId: "ab12cd34" } },
      "https://app",
    ),
  ).toBe("Guard ready.\n\nReview and sign the boundary on the web: https://app/task/ab12cd34");
  expect(channelReplyText({ status: "failed", output: null }, "https://app")).toMatch(/could not/);
});

it("queues a Telegram run's answer and the drain delivers it", async () => {
  const { runId } = await createRun(ctx.db, {
    conversationId: "telegram:7",
    ownerWallet: "0xowner",
    kind: "chat",
    clientRequestId: "telegram:1",
    input: { messages: [], agent: "0xagent", reply: { channel: "telegram", chatId: "7" } },
  });
  await completeRun(ctx.db, runId, { rationale: "ETH is calm.", taskId: null });
  await queueChannelReply(ctx.db, runId);

  const fetchMock = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "t0ken");
  const registry = new HandlerRegistry().register("notify.drain", notifyHandler);
  expect(await tick(ctx.db, registry, "w1")).toBe("ran");

  expect(fetchMock).toHaveBeenCalledWith(
    "https://api.telegram.org/bott0ken/sendMessage",
    expect.objectContaining({ body: JSON.stringify({ chat_id: "7", text: "ETH is calm." }) }),
  );
  const [row] = await ctx.db.select().from(tables.outbox).where(eq(tables.outbox.target, "7"));
  expect(row?.status).toBe("sent");
});

it("does nothing for a web run", async () => {
  const { runId } = await createRun(ctx.db, {
    conversationId: "web-1",
    ownerWallet: "0xowner",
    kind: "chat",
    clientRequestId: "q1",
    input: { messages: [], agent: "0xagent" },
  });
  await queueChannelReply(ctx.db, runId);
  expect(
    await ctx.db.select().from(tables.outbox).where(eq(tables.outbox.target, "web-1")),
  ).toHaveLength(0);
});

it("keeps a failed delivery pending and retries the drain", async () => {
  await ctx.db
    .insert(tables.outbox)
    .values({ channel: "telegram", target: "9", payload: { text: "hi" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ ok: false, description: "chat not found" }, { status: 400 })),
  );
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "t0ken");
  const [inserted] = await ctx.db
    .insert(tables.jobs)
    .values({ kind: "notify.drain", payload: {} })
    .returning({ id: tables.jobs.id });
  const registry = new HandlerRegistry().register("notify.drain", notifyHandler);
  expect(await tick(ctx.db, registry, "w1")).toBe("ran");

  const [row] = await ctx.db.select().from(tables.outbox).where(eq(tables.outbox.target, "9"));
  expect(row).toMatchObject({ status: "pending", attempts: 1 });
  const [job] = await ctx.db
    .select()
    .from(tables.jobs)
    .where(eq(tables.jobs.id, inserted?.id ?? -1));
  expect(job?.status).toBe("queued");
  expect(job?.lastError).toMatch(/chat not found/);
  expect(await leaseJob(ctx.db, { workerId: "w1" })).toBeNull(); // backed off
});

it("sends WhatsApp text through the Cloud API with the bearer token", async () => {
  const fetchMock = vi.fn(async () => Response.json({ messages: [{ id: "wamid.1" }] }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "wa-token");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123");
  await sendWhatsAppMessage("34600111222", "ETH is calm.");
  expect(fetchMock).toHaveBeenCalledWith("https://graph.facebook.com/v23.0/123/messages", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer wa-token" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: "34600111222",
      type: "text",
      text: { body: "ETH is calm." },
    }),
  });
});

it("refuses to send WhatsApp without credentials instead of pretending", async () => {
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "");
  await expect(sendWhatsAppMessage("1", "x")).rejects.toThrow(/WHATSAPP_ACCESS_TOKEN/);
});
