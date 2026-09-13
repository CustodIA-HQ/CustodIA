import { tables } from "@custodia/db";
import { eq } from "drizzle-orm";
import { sendTelegramMessage, sendWhatsAppMessage } from "../channels.js";
import type { JobHandler } from "../registry.js";

const MAX_DELIVERY_ATTEMPTS = 5;

/**
 * kind: notify.drain — delivers pending outbox rows. Web rows are already
 * visible through run events, so they are only marked sent. A failed channel
 * delivery stays pending (failed after MAX_DELIVERY_ATTEMPTS) and the job
 * throws so the queue retries it with backoff.
 */
export const notifyHandler: JobHandler = async ({ db }) => {
  const pending = await db.select().from(tables.outbox).where(eq(tables.outbox.status, "pending"));
  let lastError: unknown = null;
  for (const row of pending) {
    const attempts = row.attempts + 1;
    try {
      const { text } = row.payload as { text: string };
      if (row.channel === "telegram") await sendTelegramMessage(row.target, text);
      if (row.channel === "whatsapp") await sendWhatsAppMessage(row.target, text);
      await db
        .update(tables.outbox)
        .set({ status: "sent", sentAt: new Date(), attempts })
        .where(eq(tables.outbox.id, row.id));
    } catch (err) {
      lastError = err;
      await db
        .update(tables.outbox)
        .set({ status: attempts >= MAX_DELIVERY_ATTEMPTS ? "failed" : "pending", attempts })
        .where(eq(tables.outbox.id, row.id));
    }
  }
  if (lastError) throw lastError;
};
