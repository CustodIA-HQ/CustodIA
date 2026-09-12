import type { Mandate } from "@custodia/schema";
import { tables } from "@custodia/db";
import { eq } from "drizzle-orm";
import type { JobHandler } from "../registry.js";
import { loadLatestMandate, transitionTask } from "../tasks.js";

/**
 * kind: monitor.active — expire mandates past `exp`. Swap execution is
 * simulated from the task review page in this hackathon build.
 */
export const monitorHandler: JobHandler = async ({ db }) => {
  const active = await db.select().from(tables.tasks).where(eq(tables.tasks.status, "active"));
  const now = Math.floor(Date.now() / 1000);
  for (const task of active) {
    const mandateRow = await loadLatestMandate(db, task.id);
    if (!mandateRow) continue;
    const mandate = mandateRow.typedData as Mandate;
    if (now > mandate.exp) {
      await transitionTask(db, task.id, "expired", "system");
    }
  }
};
