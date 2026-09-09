import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

// drizzle-kit bundles this file (no import.meta.dirname) and runs it from
// packages/db. The single source of truth for secrets is the root .env, so walk
// up from the working directory until one is found (no-op if already set).
const findRootEnv = (): string | undefined => {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
};
const envPath = findRootEnv();
if (envPath) dotenv.config({ path: envPath, quiet: true });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error(
    "DATABASE_URL is not set — fill it in the root .env (Neon pooled connection string)",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  strict: true,
  verbose: true,
  dbCredentials: { url },
});
