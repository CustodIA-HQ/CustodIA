import { resolve } from "node:path";
import { createPooledDb } from "@custodia/db";
import { chatHandler, ensPublishHandler, HandlerRegistry, tick } from "@custodia/runtime";
import dotenv from "dotenv";

// The worker runs from apps/worker; secrets live in the repository root.
dotenv.config({ path: resolve(process.cwd(), "../../.env"), quiet: true });

const workerId = `${process.env.HOSTNAME ?? "local"}-${process.pid}`;
const IDLE_MS = 1_000;

const db = createPooledDb();
const registry = new HandlerRegistry()
  .register("chat.run", chatHandler)
  .register("ens.publish", ensPublishHandler);

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    stopping = true;
  });
}

console.log(`[worker ${workerId}] handling ${registry.kinds().join(", ")}`);
while (!stopping) {
  const outcome = await tick(db, registry, workerId);
  if (outcome === "idle") await new Promise((r) => setTimeout(r, IDLE_MS));
}
console.log(`[worker ${workerId}] stopped`);
