import "../../env";

import { timingSafeEqual } from "node:crypto";
import { createDb } from "@custodia/db";
import { publicAppOrigin } from "@custodia/ens/paths";
import { bindChannel, createRun, enqueueJob, findChannelBinding } from "@custodia/runtime";
import { welcomePaired, welcomeWithVerify } from "@custodia/schema";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectUrl, readPairingCode } from "../channels/pairing";
import { getAgentAddress } from "../identity";

const MAX_MESSAGE_LENGTH = 4_000;

// Only the fields the adapter reads; Telegram adds fields freely.
const UpdateSchema = z.object({
  update_id: z.number().int(),
  message: z
    .object({
      chat: z.object({ id: z.number().int(), type: z.string() }),
      from: z.object({ id: z.number().int() }).optional(),
      text: z.string().optional(),
    })
    .optional(),
});

let db: ReturnType<typeof createDb> | undefined;
const getDb = () => {
  db ??= createDb();
  return db;
};

/** Webhook reply: Telegram performs the sendMessage itself, so the handler makes no outbound call. */
const reply = (chatId: number, text: string) =>
  NextResponse.json({ method: "sendMessage", chat_id: chatId, text });

const secretMatches = (provided: string | null, expected: string): boolean => {
  const a = Buffer.from(provided ?? "");
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * POST /api/telegram — Telegram webhook. The chat is transport: a paired
 * Telegram user's text becomes a durable `chat.run` for their wallet, the
 * worker runs it, and the answer comes back through the outbox. Unpaired
 * users get a short-lived link to sign with their wallet first.
 */
export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!expected) {
    return NextResponse.json({ error: "TELEGRAM_WEBHOOK_SECRET is not set" }, { status: 503 });
  }
  if (!secretMatches(request.headers.get("x-telegram-bot-api-secret-token"), expected)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
  const message = parsed.success ? parsed.data.message : undefined;
  // Acknowledge everything we do not handle so Telegram stops redelivering it.
  // Private chats only: an answer about a wallet must not land in a group.
  if (!parsed.success || !message?.from || !message.text || message.chat.type !== "private") {
    return new NextResponse(null, { status: 200 });
  }

  const chatId = message.chat.id;
  const externalId = String(message.from.id);
  const text = message.text.trim();

  try {
    const verify = () =>
      reply(chatId, welcomeWithVerify(connectUrl("telegram", externalId, publicAppOrigin())));

    // A /start code from a signed web session still pairs directly.
    const start = text.match(/^\/start(?:\s+(\S+))?$/);
    const startWallet = start?.[1] ? readPairingCode("telegram", start[1]) : null;
    if (startWallet) {
      await bindChannel(getDb(), { channel: "telegram", externalId, ownerWallet: startWallet });
      return reply(chatId, welcomePaired(startWallet));
    }

    const ownerWallet = await findChannelBinding(getDb(), "telegram", externalId);
    if (!ownerWallet) return verify();
    if (start) return reply(chatId, welcomePaired(ownerWallet));
    if (text.length > MAX_MESSAGE_LENGTH) {
      return reply(chatId, `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`);
    }

    // update_id is the idempotency key: a Telegram redelivery returns the same run.
    const { runId, created } = await createRun(getDb(), {
      conversationId: `telegram:${chatId}`,
      ownerWallet,
      kind: "chat",
      clientRequestId: `telegram:${parsed.data.update_id}`,
      input: {
        messages: [{ role: "user", content: text }],
        agent: getAgentAddress(),
        reply: { channel: "telegram", chatId: String(chatId) },
      },
    });
    if (!created) return new NextResponse(null, { status: 200 });
    await enqueueJob(getDb(), {
      kind: "chat.run",
      payload: { runId },
      dedupeKey: `chat.run:${runId}`,
    });
    return reply(chatId, "Working on it…");
  } catch (error) {
    // A non-2xx makes Telegram redeliver; run creation is idempotent on update_id.
    console.error(`[telegram] ${error instanceof Error ? error.name : "Error"}`);
    return NextResponse.json({ error: "Telegram update could not be processed" }, { status: 503 });
  }
}
