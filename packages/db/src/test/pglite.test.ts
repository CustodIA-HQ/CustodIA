import { afterAll, beforeAll, expect, it } from "vitest";
import * as schema from "../schema.js";
import { createTestDb } from "./pglite.js";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  ctx = await createTestDb();
});
afterAll(async () => {
  await ctx.close();
});

it("applies every migration, including the partial unique index on live jobs", async () => {
  await ctx.db.insert(schema.jobs).values({ kind: "chat.run", payload: {}, dedupeKey: "k" });
  // drizzle wraps driver errors; the unique violation is on `cause`.
  const violation = await ctx.db
    .insert(schema.jobs)
    .values({ kind: "chat.run", payload: {}, dedupeKey: "k" })
    .then(
      () => null,
      (err: unknown) => err as Error & { cause?: Error },
    );
  expect(violation).not.toBeNull();
  expect(String(violation?.cause?.message ?? violation?.message)).toMatch(
    /jobs_live_dedupe_idx|duplicate key/,
  );
  // a finished job frees the key
  await ctx.db.update(schema.jobs).set({ status: "done" });
  await ctx.db.insert(schema.jobs).values({ kind: "chat.run", payload: {}, dedupeKey: "k" });
});
