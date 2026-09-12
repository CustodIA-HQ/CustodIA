import { tables } from "@custodia/db";
import { canTransition, normalizeTaskStatus, type TaskStatus } from "@custodia/schema";
import { and, desc, eq } from "drizzle-orm";
import type { AnyDb } from "./runs.js";

export const loadTask = async (db: AnyDb, taskId: string) => {
  const [task] = await db.select().from(tables.tasks).where(eq(tables.tasks.id, taskId)).limit(1);
  return task ?? null;
};

export const loadLatestMandate = async (db: AnyDb, taskId: string) => {
  const [row] = await db
    .select()
    .from(tables.mandates)
    .where(eq(tables.mandates.taskId, taskId))
    .orderBy(desc(tables.mandates.version))
    .limit(1);
  return row ?? null;
};

export const loadLatestProposal = async (db: AnyDb, taskId: string) => {
  const [row] = await db
    .select()
    .from(tables.proposals)
    .where(eq(tables.proposals.taskId, taskId))
    .orderBy(desc(tables.proposals.version))
    .limit(1);
  return row ?? null;
};

export const transitionTask = async (
  db: AnyDb,
  taskId: string,
  to: TaskStatus,
  actor: "owner" | "operator" | "agent" | "system",
): Promise<TaskStatus> => {
  const task = await loadTask(db, taskId);
  if (!task) throw new Error(`task ${taskId} not found`);
  const from = normalizeTaskStatus(task.status);
  if (!from) throw new Error(`task ${taskId} has unknown status ${task.status}`);
  if (!canTransition(from, to, actor)) {
    throw new Error(`cannot move task ${taskId} from ${from} to ${to} as ${actor}`);
  }
  await db
    .update(tables.tasks)
    .set({
      status: to,
      revokedAt: to === "revoked" ? new Date() : task.revokedAt,
    })
    .where(and(eq(tables.tasks.id, taskId), eq(tables.tasks.status, task.status)));
  return to;
};
