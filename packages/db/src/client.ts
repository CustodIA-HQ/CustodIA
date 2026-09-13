import dns from "node:dns";
import { NotImplementedError } from "@custodia/schema";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

/**
 * Neon Postgres client. The DATABASE_URL is the whole prerequisite: without a
 * live database the package cannot function, and that must be loud — there is
 * no local or in-memory fallback for production data.
 */
// Neon hosts publish AAAA records. On networks without a working IPv6 route
// Node's dual-stack connect stalls on the first request of a process
// (fetch failed / ETIMEDOUT), which surfaced as random 500s on cold routes.
dns.setDefaultResultOrder("ipv4first");

export const createDb = (databaseUrl: string | undefined = process.env.DATABASE_URL) => {
  if (!databaseUrl) {
    throw new NotImplementedError("DATABASE_URL (Neon Postgres)");
  }
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
};

export type Db = ReturnType<typeof createDb>;
