import { tables } from "@custodia/db";
import { eq } from "drizzle-orm";
import type { JobHandler } from "../registry.js";

/**
 * kind: notify.drain — marks pending outbox rows sent.
 * Channel adapters (Telegram/WhatsApp) replace this stub; web is already live.
 */
export const notifyHandler: JobHandler = async ({ db }) => {
  const pending = await db.select().from(tables.outbox).where(eq(tables.outbox.status, "pending"));
  for (const row of pending) {
    await db
      .update(tables.outbox)
      .set({ status: "sent", sentAt: new Date(), attempts: row.attempts + 1 })
      .where(eq(tables.outbox.id, row.id));
  }
};
