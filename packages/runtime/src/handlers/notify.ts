import { tables } from "@custodia/db";
import { publicAppOrigin } from "@custodia/ens/paths";
import { and, eq, ne } from "drizzle-orm";
import { queueChannelMessage, sendTelegramMessage, sendWhatsAppMessage } from "../channels.js";
import type { JobHandler } from "../registry.js";
import type { AnyDb } from "../runs.js";

const MAX_DELIVERY_ATTEMPTS = 5;

type OutboxPayload = { text?: string; alerted?: boolean };

/**
 * WhatsApp refuses free-form text once 24 h have passed since the user's last
 * message. When that (or any delivery failure) hits, alert the owner's other
 * chats once — Telegram has no such window — so a pending decision is never
 * silently lost. The alert carries the original text and the web chat link.
 */
async function alertOtherChannels(
  db: AnyDb,
  row: typeof tables.outbox.$inferSelect,
  text: string,
): Promise<boolean> {
  const [binding] = await db
    .select()
    .from(tables.channelBindings)
    .where(
      and(
        eq(tables.channelBindings.channel, row.channel),
        eq(tables.channelBindings.externalId, row.target),
      ),
    )
    .limit(1);
  if (!binding) return false;
  const others = await db
    .select()
    .from(tables.channelBindings)
    .where(
      and(
        eq(tables.channelBindings.ownerWallet, binding.ownerWallet),
        ne(tables.channelBindings.channel, row.channel),
      ),
    );
  const label = row.channel === "whatsapp" ? "WhatsApp" : "Telegram";
  const alert = `You have a pending CustodIA message that ${label} could not deliver (its 24-hour reply window is closed). You can answer here, or in web chat: ${publicAppOrigin()}/chat\n\n${text}`;
  let sent = false;
  for (const other of others) {
    if (other.channel === "telegram" || other.channel === "whatsapp") {
      await queueChannelMessage(db, { channel: other.channel, chatId: other.externalId }, alert);
      sent = true;
    }
  }
  return sent;
}

/**
 * kind: notify.drain — delivers pending outbox rows. Web rows are already
 * visible through run events, so they are only marked sent. A failed channel
 * delivery stays pending (failed after MAX_DELIVERY_ATTEMPTS) and the job
 * throws so the queue retries it with backoff; the first WhatsApp failure
 * also alerts the owner's other chats.
 */
export const notifyHandler: JobHandler = async ({ db }) => {
  const pending = await db.select().from(tables.outbox).where(eq(tables.outbox.status, "pending"));
  let lastError: unknown = null;
  for (const row of pending) {
    const attempts = row.attempts + 1;
    const payload = (row.payload ?? {}) as OutboxPayload;
    try {
      const text = payload.text ?? "";
      if (row.channel === "telegram") await sendTelegramMessage(row.target, text);
      if (row.channel === "whatsapp") await sendWhatsAppMessage(row.target, text);
      await db
        .update(tables.outbox)
        .set({ status: "sent", sentAt: new Date(), attempts })
        .where(eq(tables.outbox.id, row.id));
    } catch (err) {
      lastError = err;
      let alerted = payload.alerted === true;
      if (row.channel === "whatsapp" && !alerted && payload.text) {
        alerted = await alertOtherChannels(db, row, payload.text).catch(() => false);
      }
      await db
        .update(tables.outbox)
        .set({
          status: attempts >= MAX_DELIVERY_ATTEMPTS ? "failed" : "pending",
          attempts,
          payload: { ...payload, alerted },
        })
        .where(eq(tables.outbox.id, row.id));
    }
  }
  if (lastError) throw lastError;
};
