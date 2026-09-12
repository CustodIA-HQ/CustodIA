import { NotImplementedError } from "@custodia/schema";
import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema.js";

neonConfig.webSocketConstructor = ws;

/**
 * Transactional driver (WebSocket) for the worker. The HTTP driver used by the
 * web routes cannot run transactions or `FOR UPDATE SKIP LOCKED`.
 */
export const createPooledDb = (url: string | undefined = process.env.DATABASE_URL) => {
  if (!url) throw new NotImplementedError("DATABASE_URL (Neon Postgres)");
  return drizzle(new Pool({ connectionString: url }), { schema });
};
export type PooledDb = ReturnType<typeof createPooledDb>;
