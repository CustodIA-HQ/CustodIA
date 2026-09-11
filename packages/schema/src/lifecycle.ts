import { z } from "zod";

export const TASK_STATUSES = [
  "draft",
  "awaiting_authorization",
  "active",
  "needs_human",
  "completed",
  "expired",
  "revoked",
] as const;
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskActor = "agent" | "operator" | "owner" | "system";

const LEGACY: Record<string, TaskStatus> = { "needs-human": "needs_human" };

/** Accepts v2 strings in any case plus the v0 `needs-human`; null for anything else. */
export const normalizeTaskStatus = (raw: string): TaskStatus | null => {
  const key = raw.trim().toLowerCase();
  const mapped = LEGACY[key] ?? key;
  return (TASK_STATUSES as readonly string[]).includes(mapped) ? (mapped as TaskStatus) : null;
};

/** Who may cause which transition. The agent can only narrow (escalate/finish). */
const TRANSITIONS: Record<TaskStatus, Partial<Record<TaskStatus, TaskActor[]>>> = {
  draft: { awaiting_authorization: ["system"], expired: ["system"] },
  awaiting_authorization: {
    active: ["system"],
    expired: ["system"],
    revoked: ["owner", "operator"],
  },
  active: {
    needs_human: ["agent", "system"],
    completed: ["agent", "system"],
    expired: ["system"],
    revoked: ["owner", "operator"],
  },
  needs_human: {
    active: ["owner"],
    completed: ["owner"],
    expired: ["system"],
    revoked: ["owner", "operator"],
  },
  completed: {},
  expired: {},
  revoked: {},
};

export const canTransition = (from: TaskStatus, to: TaskStatus, actor: TaskActor): boolean =>
  (TRANSITIONS[from][to] ?? []).includes(actor);
