import { createTestDb, tables } from "@custodia/db";
import { wantsTextOnly } from "@custodia/schema";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import {
  bindChannel,
  channelReplyText,
  findChannelBinding,
  queueChannelReply,
  readWalletViewToken,
  sendWhatsAppMessage,
  summarizeRunEvents,
} from "./channels.js";
import { notifyHandler } from "./handlers/notify.js";
import { leaseJob } from "./jobs.js";
import { HandlerRegistry, tick } from "./registry.js";
import { appendEvent, completeRun, createRun } from "./runs.js";

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

it("answers a holdings question from the streamed text and priced wallet snapshot", () => {
  const summary = summarizeRunEvents([
    { type: "stage", payload: null },
    {
      type: "tool",
      payload: {
        name: "read_portfolio",
        output: {
          eth: "0.609765726380609078",
          usdc: "0",
          weth: "0",
          chain: "Ethereum Sepolia testnet",
        },
      },
    },
    { type: "tool", payload: { name: "get_market_context", output: { priceUsd: 2471.08 } } },
    { type: "text", payload: { delta: "No history here: " } },
    { type: "text", payload: { delta: "this is a current snapshot." } },
  ]);
  expect(
    channelReplyText({ status: "done", output: { rationale: "" } }, "https://app", summary),
  ).toBe(
    "No history here: this is a current snapshot.\n\nWallet on Ethereum Sepolia testnet: 0.6098 ETH (~$1,507 at $2,471), 0 USDC, 0 WETH. Testnet balances, no real value.",
  );
  // Without events, the old behaviour stands.
  expect(channelReplyText({ status: "done", output: { rationale: "" } }, "https://app")).toBe(
    "Done.",
  );
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

it("sends a holdings answer with a graph link, or text only when asked", async () => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  vi.stubEnv("APP_URL", "https://app.test");
  const events = [
    {
      stage: "inspecting_wallet",
      type: "tool",
      payload: {
        type: "tool",
        name: "read_portfolio",
        output: {
          eth: "1",
          usdc: "0",
          weth: "0",
          chain: "Ethereum Sepolia testnet",
          owner: "0xowner",
        },
      },
    },
    {
      stage: "fetching_context",
      type: "tool",
      payload: {
        type: "tool",
        name: "get_market_context",
        output: {
          priceUsd: 2000,
          hourly: [
            { ts: 1, close: 1990 },
            { ts: 2, close: 2000 },
          ],
        },
      },
    },
    {
      stage: "fetching_context",
      type: "text",
      payload: { type: "text", delta: "Current snapshot." },
    },
  ] as const;
  const ask = async (content: string, id: string) => {
    const { runId } = await createRun(ctx.db, {
      conversationId: `telegram:${id}`,
      ownerWallet: "0xowner",
      kind: "chat",
      clientRequestId: `telegram:${id}`,
      input: {
        messages: [{ role: "user", content }],
        agent: "0xagent",
        reply: { channel: "telegram", chatId: id },
      },
    });
    for (const e of events) await appendEvent(ctx.db, runId, e);
    await completeRun(ctx.db, runId, { rationale: "", taskId: null });
    await queueChannelReply(ctx.db, runId);
    const [row] = await ctx.db.select().from(tables.outbox).where(eq(tables.outbox.target, id));
    return { runId, text: (row?.payload as { text?: string } | undefined)?.text ?? "" };
  };

  const graph = await ask("show my portfolio", "g1");
  expect(graph.text).toMatch(
    /^Current snapshot\.\n\nWallet on Ethereum Sepolia testnet: 1 ETH \(~\$2,000 at \$2,000\)/,
  );
  const link = graph.text.match(/Graph: (\S+)/)?.[1] ?? "";
  expect(link.startsWith("https://app.test/wallet?t=")).toBe(true);
  const token = new URL(link).searchParams.get("t") ?? "";
  expect(readWalletViewToken(token)).toBe(graph.runId);
  expect(readWalletViewToken(token, Date.now() + 25 * 60 * 60 * 1_000)).toBeNull();
  expect(readWalletViewToken(`${token}x`)).toBeNull();

  const text = await ask("show my portfolio in text", "g2");
  expect(text.text).not.toContain("Graph:");
  expect(wantsTextOnly("mi portafolio en texto")).toBe(true);
  expect(wantsTextOnly("portfolio without a chart")).toBe(true);
  expect(wantsTextOnly("show my portfolio")).toBe(false);
});

it("alerts the owner's Telegram once when WhatsApp cannot deliver (24 h window)", async () => {
  await bindChannel(ctx.db, {
    channel: "whatsapp",
    externalId: "34600111222",
    ownerWallet: "0xdual",
  });
  await bindChannel(ctx.db, { channel: "telegram", externalId: "4242", ownerWallet: "0xdual" });
  await ctx.db.insert(tables.outbox).values({
    channel: "whatsapp",
    target: "34600111222",
    payload: { text: "Agent proposal — rebalance. Reply YES or NO." },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("graph.facebook.com")
        ? Response.json(
            { error: { message: "Re-engagement message", code: 131047 } },
            { status: 400 },
          )
        : Response.json({ ok: true }),
    ),
  );
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "wa-token");
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "123");
  vi.stubEnv("TELEGRAM_BOT_TOKEN", "t0ken");
  vi.stubEnv("APP_URL", "https://app.test");
  const registry = new HandlerRegistry().register("notify.drain", notifyHandler);
  await ctx.db.insert(tables.jobs).values({ kind: "notify.drain", payload: {} });
  await tick(ctx.db, registry, "w1"); // WhatsApp fails → Telegram alert queued

  const [alert] = await ctx.db.select().from(tables.outbox).where(eq(tables.outbox.target, "4242"));
  expect((alert?.payload as { text?: string } | undefined)?.text).toMatch(
    /^You have a pending CustodIA message that WhatsApp could not deliver .*https:\/\/app\.test\/chat\n\nAgent proposal — rebalance/,
  );
  const [wa] = await ctx.db
    .select()
    .from(tables.outbox)
    .where(eq(tables.outbox.target, "34600111222"));
  expect(wa).toMatchObject({ status: "pending", attempts: 1, payload: { alerted: true } });

  // The retry of the same WhatsApp row must not alert again.
  await ctx.db.insert(tables.jobs).values({ kind: "notify.drain", payload: {} });
  await tick(ctx.db, registry, "w1");
  expect(
    await ctx.db.select().from(tables.outbox).where(eq(tables.outbox.target, "4242")),
  ).toHaveLength(1);
});
