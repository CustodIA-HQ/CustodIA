import { NotImplementedError } from "@custodia/schema";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.js";

/**
 * Neon Postgres client. The DATABASE_URL is the whole prerequisite: without a
 * live database the package cannot function, and that must be loud — there is
 * no local or in-memory fallback for production data.
 */
export const createDb = (databaseUrl: string | undefined = process.env.DATABASE_URL) => {
  if (!databaseUrl) {
    throw new NotImplementedError("DATABASE_URL (Neon Postgres)");
  }
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
};

export type Db = ReturnType<typeof createDb>;
