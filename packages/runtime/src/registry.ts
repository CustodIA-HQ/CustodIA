import { completeJob, failJob, heartbeatJob, type Job, leaseJob } from "./jobs.js";
import type { AnyDb } from "./runs.js";

export type JobHandler = (ctx: {
  db: AnyDb;
  job: Job;
  /** Extend the lease; call from long-running handlers. */
  heartbeat: () => Promise<void>;
}) => Promise<void>;

export class HandlerRegistry {
  private readonly handlers = new Map<string, JobHandler>();
  register(kind: string, handler: JobHandler): this {
    this.handlers.set(kind, handler);
    return this;
  }
  handlerFor(kind: string): JobHandler | undefined {
    return this.handlers.get(kind);
  }
  kinds(): string[] {
    return [...this.handlers.keys()];
  }
}

/** Lease one job and run it to completion or failure. Never throws. */
export async function tick(
  db: AnyDb,
  registry: HandlerRegistry,
  workerId: string,
): Promise<"idle" | "ran"> {
  const job = await leaseJob(db, { workerId, kinds: registry.kinds() });
  if (!job) return "idle";
  const handler = registry.handlerFor(job.kind);
  if (!handler) {
    await failJob(db, job.id, workerId, `no handler for ${job.kind}`, { maxAttempts: 1 });
    return "ran";
  }
  try {
    await handler({
      db,
      job,
      heartbeat: async () => {
        await heartbeatJob(db, job.id, workerId);
      },
    });
    await completeJob(db, job.id, workerId);
  } catch (err) {
    await failJob(db, job.id, workerId, err instanceof Error ? err.message : String(err));
  }
  return "ran";
}
