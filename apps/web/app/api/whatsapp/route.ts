import "../../env";

import { createHmac, timingSafeEqual } from "node:crypto";
import { generateWelcome } from "@custodia/agent";
import { createDb } from "@custodia/db";
import { publicAppOrigin } from "@custodia/ens/paths";
import {
  bindChannel,
  createRun,
  enqueueJob,
  findChannelBinding,
  queueChannelMessage,
} from "@custodia/runtime";
import { NextResponse } from "next/server";
import { z } from "zod";
import { connectUrl, readPairingCode } from "../channels/pairing";
import { getAgentAddress } from "../identity";

const MAX_MESSAGE_LENGTH = 4_000;

// Only the fields the adapter reads; delivery statuses and other types are ignored.
const WebhookSchema = z.object({
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          value: z.object({
            messages: z
              .array(
                z.object({
                  from: z.string(),
                  id: z.string(),
                  type: z.string(),
                  text: z.object({ body: z.string() }).optional(),
                }),
              )
              .optional(),
          }),
        }),
      ),
    }),
  ),
});

let db: ReturnType<typeof createDb> | undefined;
const getDb = () => {
  db ??= createDb();
  return db;
};

const safeEqual = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

/** GET /api/whatsapp — Meta's one-time webhook verification handshake. */
export async function GET(request: Request) {
  const expected = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  const params = new URL(request.url).searchParams;
  if (
    !expected ||
    params.get("hub.mode") !== "subscribe" ||
    !safeEqual(params.get("hub.verify_token") ?? "", expected)
  ) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
}

/**
 * POST /api/whatsapp — WhatsApp Cloud API webhook. Same contract as Telegram:
 * a paired number's text becomes a durable `chat.run`; every reply (including
 * the acknowledgement) goes through the outbox, so the webhook makes no
 * outbound call and answers Meta immediately.
 */
export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!appSecret) {
    return NextResponse.json({ error: "WHATSAPP_APP_SECRET is not set" }, { status: 503 });
  }
  const raw = await request.text();
  const signature = request.headers.get("x-hub-signature-256") ?? "";
  const expected = `sha256=${createHmac("sha256", appSecret).update(raw).digest("hex")}`;
  if (!safeEqual(signature, expected)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new NextResponse(null, { status: 200 });
  }
  const parsed = WebhookSchema.safeParse(body);
  if (!parsed.success) return new NextResponse(null, { status: 200 });

  const messages = parsed.data.entry.flatMap((entry) =>
    entry.changes.flatMap((change) => change.value.messages ?? []),
  );

  try {
    for (const message of messages) {
      if (message.type !== "text" || !message.text) continue;
      const target = { channel: "whatsapp" as const, chatId: message.from };
      const verifyText = () =>
        generateWelcome({
          surface: "whatsapp",
          paired: { verifyLink: connectUrl("whatsapp", message.from, publicAppOrigin()) },
        });
      const text = message.text.body.trim();

      const connect = text.match(/^connect\s+(\S+)$/i);
      if (connect?.[1]) {
        const wallet = readPairingCode("whatsapp", connect[1]);
        if (!wallet) {
          await queueChannelMessage(
            getDb(),
            target,
            `That pairing code is invalid or expired. ${await verifyText()}`,
          );
          continue;
        }
        await bindChannel(getDb(), {
          channel: "whatsapp",
          externalId: message.from,
          ownerWallet: wallet,
        });
        await queueChannelMessage(
          getDb(),
          target,
          await generateWelcome({ surface: "whatsapp", paired: { wallet } }),
        );
        continue;
      }

      const ownerWallet = await findChannelBinding(getDb(), "whatsapp", message.from);
      if (!ownerWallet) {
        await queueChannelMessage(getDb(), target, await verifyText());
        continue;
      }
      if (text.length > MAX_MESSAGE_LENGTH) {
        await queueChannelMessage(
          getDb(),
          target,
          `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`,
        );
        continue;
      }

      // The WhatsApp message id is the idempotency key: Meta redeliveries return the same run.
      const { runId, created } = await createRun(getDb(), {
        conversationId: `whatsapp:${message.from}`,
        ownerWallet,
        kind: "chat",
        clientRequestId: `whatsapp:${message.id}`,
        input: {
          messages: [{ role: "user", content: text }],
          agent: getAgentAddress(),
          reply: target,
        },
      });
      if (!created) continue;
      await enqueueJob(getDb(), {
        kind: "chat.run",
        payload: { runId },
        dedupeKey: `chat.run:${runId}`,
      });
      await queueChannelMessage(getDb(), target, "Working on it…");
    }
    return new NextResponse(null, { status: 200 });
  } catch (error) {
    // A non-2xx makes Meta redeliver; run creation is idempotent on the message id.
    console.error(`[whatsapp] ${error instanceof Error ? error.name : "Error"}`);
    return NextResponse.json({ error: "WhatsApp update could not be processed" }, { status: 503 });
  }
}
