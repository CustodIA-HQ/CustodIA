import { resolve } from "node:path";
import { createPooledDb } from "@custodia/db";
import {
  chatHandler,
  enqueueJob,
  ensAttachHandler,
  ensPublishHandler,
  ensReleaseHandler,
  ensVerifySubdomainHandler,
  executeHandler,
  HandlerRegistry,
  monitorHandler,
  notifyHandler,
  tick,
} from "@custodia/runtime";
import dotenv from "dotenv";

// The worker runs from apps/worker; secrets live in the repository root.
dotenv.config({ path: resolve(process.cwd(), "../../.env"), quiet: true });

const workerId = `${process.env.HOSTNAME ?? "local"}-${process.pid}`;
const IDLE_MS = 1_000;

const db = createPooledDb();
const registry = new HandlerRegistry()
  .register("chat.run", chatHandler)
  .register("ens.attach", ensAttachHandler)
  .register("ens.publish", ensPublishHandler)
  .register("ens.release", ensReleaseHandler)
  .register("ens.verify.subdomain", ensVerifySubdomainHandler)
  .register("execute", executeHandler)
  .register("monitor.active", monitorHandler)
  .register("notify.drain", notifyHandler);

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

// The watch loop: monitor.active every minute (deduped, so several workers share one).
const MONITOR_EVERY_MS = 60_000;
let nextMonitorAt = 0;

console.log(`[worker ${workerId}] handling ${registry.kinds().join(", ")}`);
while (!stopping) {
  if (Date.now() >= nextMonitorAt) {
    nextMonitorAt = Date.now() + MONITOR_EVERY_MS;
    await enqueueJob(db, {
      kind: "monitor.active",
      payload: {},
      dedupeKey: "monitor.active",
    }).catch((error: unknown) =>
      console.error(`[worker] monitor enqueue: ${error instanceof Error ? error.message : error}`),
    );
  }
  const outcome = await tick(db, registry, workerId);
  if (outcome === "idle") await new Promise((r) => setTimeout(r, IDLE_MS));
}
console.log(`[worker ${workerId}] stopped`);
