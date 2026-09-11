# Stage 1 — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every chat request a durable, idempotent run processed by a worker that survives reloads, duplicate delivery and crashes, and make authorization reference an immutable server-side proposal.

**Architecture:** A new `packages/runtime` owns runs, run events, jobs (leased with `FOR UPDATE SKIP LOCKED`), proposals and the outbox on top of Drizzle. The web routes only enqueue and read; `apps/worker` executes. The Neon HTTP driver cannot run transactions, so the worker uses a WebSocket `Pool` driver (`packages/db/src/pooled.ts`), and SQL-level tests run against in-process PGlite. Auth challenges stay stateless but become single-use via a consumed-nonce table. Task status moves to the 7-state lifecycle.

**Tech Stack:** Drizzle 0.44 (`drizzle-orm/neon-serverless` + `drizzle-orm/pglite`), `@neondatabase/serverless` `Pool`, `@electric-sql/pglite`, vitest, Next.js 15 route handlers, viem.

**Spec:** `docs/superpowers/specs/2026-09-11-custodia-v1-spec.md` §4 (Interfaces, Persistence and concurrency) and §3 (Durable autonomous runtime — task states). Master plan: `docs/superpowers/plans/2026-09-11-custodia-v1-master.md`.

## Global Constraints

- Status strings: `draft | awaiting_authorization | active | needs_human | completed | expired | revoked` (lowercase snake_case). The ENS `xyz.custodia.status` record uses the same strings from now on; readers accept the legacy `needs-human`.
- Idempotency key for chat: `clientRequestId` (UUID) supplied by the client; unique per conversation.
- Jobs: `dedupe_key` unique among non-terminal jobs; lease = 60 s; max 5 attempts; backoff `min(2^attempt, 60) s`.
- Authorization references `proposals.hash` = keccak256 of the canonical JSON of `{ market, uiSpec, proposal }`. The mandate route ignores any market/UI in the request body.
- No mocked data: tests use PGlite for SQL and mocked `runAgent`; live paths stay live.
- Commit after every task; `pnpm typecheck && pnpm test && pnpm lint` green before each commit.

---

## File structure

| Path | Responsibility |
|---|---|
| `packages/db/src/schema.ts` | +8 tables (below); `tasks.status` default `draft` |
| `packages/db/src/pooled.ts` | `createPooledDb(url)` — transactional driver for the worker |
| `packages/db/src/challenge-store.ts` | `PostgresChallengeStore` |
| `packages/db/src/test/pglite.ts` | `createTestDb()` — PGlite + migrations for tests |
| `packages/schema/src/lifecycle.ts` | `TaskStatus`, `TASK_STATUSES`, `normalizeTaskStatus`, `canTransition` |
| `packages/runtime/src/runs.ts` | `createRun`, `appendEvent`, `listEvents`, `completeRun`, `failRun` |
| `packages/runtime/src/jobs.ts` | `enqueueJob`, `leaseJob`, `heartbeatJob`, `completeJob`, `failJob` |
| `packages/runtime/src/proposals.ts` | `storeProposal`, `loadProposal`, `proposalHash` |
| `packages/runtime/src/registry.ts` | `JobHandler`, `HandlerRegistry`, `tick` |
| `packages/runtime/src/handlers/chat.ts` | `chatHandler` |
| `packages/runtime/src/handlers/ens-publish.ts` | `ensPublishHandler` |
| `apps/worker/src/main.ts` | loop + SIGTERM |
| `apps/web/app/api/chat/route.ts` | enqueue-only |
| `apps/web/app/api/runs/[id]/events/route.ts` | polling |
| `apps/web/app/api/mandate/route.ts` | proposal-bound |
| `apps/web/app/api/auth/session.ts` | consume nonce |
| `apps/web/app/chat-section.tsx` | poll + stage UI |

---

### Task 1: Schema — durable tables and PGlite test harness

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/src/test/pglite.ts`
- Create: `packages/db/src/schema.test.ts`
- Modify: `packages/db/package.json` (deps: `@electric-sql/pglite`, script `test`)
- Generate: `packages/db/drizzle/0002_*.sql` via `pnpm db:generate`

**Interfaces:**
- Produces: tables `conversations, channelBindings, authChallenges, runs, runEvents, jobs, proposals, outbox` exported from `packages/db` `tables`; `createTestDb(): Promise<{ db: PgliteDatabase<typeof schema>; close(): Promise<void> }>`.

- [ ] **Step 1: Add the dependency and a test script**

```bash
cd packages/db && pnpm add -D @electric-sql/pglite && cd ../..
```
In `packages/db/package.json` set `"test": "vitest run"` (drop `--passWithNoTests`).

- [ ] **Step 2: Write the failing schema test**

`packages/db/src/schema.test.ts`:
```ts
import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "./schema.js";

describe("durable schema", () => {
  it("has the stage-1 tables with their key columns", () => {
    expect(Object.keys(getTableColumns(schema.runs))).toEqual(
      expect.arrayContaining(["id", "conversationId", "ownerWallet", "kind", "status", "clientRequestId", "input", "output", "createdAt", "finishedAt"]),
    );
    expect(Object.keys(getTableColumns(schema.jobs))).toEqual(
      expect.arrayContaining(["id", "kind", "payload", "dedupeKey", "status", "attempts", "leasedBy", "leasedUntil", "runAfter", "lastError"]),
    );
    expect(Object.keys(getTableColumns(schema.proposals))).toEqual(
      expect.arrayContaining(["id", "runId", "taskId", "version", "hash", "body", "createdAt"]),
    );
    expect(Object.keys(getTableColumns(schema.authChallenges))).toEqual(
      expect.arrayContaining(["nonce", "conversationId", "address", "consumedAt"]),
    );
    expect(Object.keys(getTableColumns(schema.outbox))).toEqual(
      expect.arrayContaining(["id", "channel", "target", "payload", "status", "attempts", "createdAt", "sentAt"]),
    );
    expect(schema.tasks.status.default).toBe("draft");
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @custodia/db test`
Expected: FAIL — `schema.runs` is undefined.

- [ ] **Step 4: Add the tables**

Append to `packages/db/src/schema.ts` (keep existing tables; change `tasks.status` default to `"draft"`):
```ts
export const conversations = pgTable("conversations", {
  id: text("id").primaryKey(), // uuid from the client
  ownerWallet: text("owner_wallet").notNull(),
  agent: text("agent").notNull(),
  channel: text("channel").notNull().default("web"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const channelBindings = pgTable(
  "channel_bindings",
  {
    id: serial("id").primaryKey(),
    channel: text("channel").notNull(), // telegram | whatsapp | xmtp
    externalId: text("external_id").notNull(),
    ownerWallet: text("owner_wallet").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("channel_bindings_channel_external_idx").on(t.channel, t.externalId)],
);

export const authChallenges = pgTable("auth_challenges", {
  nonce: text("nonce").primaryKey(), // HMAC nonce from the challenge message
  conversationId: text("conversation_id").notNull(),
  address: text("address").notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }).defaultNow().notNull(),
});

export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(), // uuid
    conversationId: text("conversation_id").notNull(),
    ownerWallet: text("owner_wallet").notNull(),
    kind: text("kind").notNull(), // chat
    status: text("status").notNull().default("queued"), // queued | running | done | failed
    clientRequestId: text("client_request_id").notNull(),
    input: jsonb("input").notNull(),
    output: jsonb("output"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("runs_conversation_request_idx").on(t.conversationId, t.clientRequestId)],
);

export const runEvents = pgTable(
  "run_events",
  {
    id: serial("id").primaryKey(),
    runId: text("run_id").notNull(),
    seq: integer("seq").notNull(),
    stage: text("stage").notNull(), // inspecting_wallet | fetching_context | paying_analysis | generating_ui | awaiting_signature | publishing | done | failed
    type: text("type").notNull(), // text | tool | stage | result | error
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("run_events_run_seq_idx").on(t.runId, t.seq)],
);

export const jobs = pgTable(
  "jobs",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(), // chat.run | ens.publish | notify
    payload: jsonb("payload").notNull(),
    dedupeKey: text("dedupe_key"),
    status: text("status").notNull().default("queued"), // queued | leased | done | failed
    attempts: integer("attempts").notNull().default(0),
    leasedBy: text("leased_by"),
    leasedUntil: timestamp("leased_until", { withTimezone: true }),
    runAfter: timestamp("run_after", { withTimezone: true }).defaultNow().notNull(),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("jobs_status_run_after_idx").on(t.status, t.runAfter),
    // one live job per dedupe key (partial unique index added in the migration SQL, see Step 6)
  ],
);

export const proposals = pgTable(
  "proposals",
  {
    id: text("id").primaryKey(), // uuid
    runId: text("run_id").notNull(),
    taskId: text("task_id").notNull(),
    ownerWallet: text("owner_wallet").notNull(),
    version: integer("version").notNull().default(1),
    hash: text("hash").notNull(), // keccak256(canonical JSON of body)
    body: jsonb("body").notNull(), // { market, uiSpec, proposal }
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("proposals_task_version_idx").on(t.taskId, t.version)],
);

export const outbox = pgTable("outbox", {
  id: serial("id").primaryKey(),
  channel: text("channel").notNull(), // web | telegram | whatsapp
  target: text("target").notNull(), // conversation id or external id
  payload: jsonb("payload").notNull(),
  status: text("status").notNull().default("pending"), // pending | sent | failed
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  sentAt: timestamp("sent_at", { withTimezone: true }),
});
```

- [ ] **Step 5: Write the PGlite test harness**

`packages/db/src/test/pglite.ts`:
```ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { resolve } from "node:path";
import * as schema from "../schema.js";

/** In-process Postgres with the real migrations applied — for SQL-level unit tests. */
export async function createTestDb(): Promise<{ db: PgliteDatabase<typeof schema>; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: resolve(import.meta.dirname, "../../drizzle") });
  return { db, close: () => client.close() };
}
```
Export it from `packages/db/src/index.ts`: `export { createTestDb } from "./test/pglite.js";`

- [ ] **Step 6: Generate the migration and add the partial unique index**

```bash
pnpm db:generate
```
Open the new `packages/db/drizzle/0002_*.sql` and append:
```sql
CREATE UNIQUE INDEX "jobs_live_dedupe_idx" ON "jobs" ("dedupe_key") WHERE "status" IN ('queued','leased') AND "dedupe_key" IS NOT NULL;
```
(Drizzle cannot express partial indexes for this dialect version; the migration is the source of truth.)

- [ ] **Step 7: Run the tests**

Run: `pnpm --filter @custodia/db test`
Expected: PASS.

- [ ] **Step 8: Apply to Neon and commit**

```bash
pnpm db:migrate
git add packages/db && git commit -m "feat(db): durable runs, jobs, proposals, challenges, outbox tables + PGlite test harness"
```

---

### Task 2: Task lifecycle v2

**Files:**
- Create: `packages/schema/src/lifecycle.ts`
- Create: `packages/schema/src/lifecycle.test.ts`
- Modify: `packages/schema/src/index.ts` (replace `TaskStatusSchema`, re-export lifecycle)
- Modify: `packages/ens/src/ops.ts:83` (`"xyz.custodia.status": "draft"` at creation; `setStatus` accepts v2 strings)

**Interfaces:**
- Produces: `TASK_STATUSES`, `TaskStatusSchema`, `type TaskStatus`, `normalizeTaskStatus(raw: string): TaskStatus | null`, `canTransition(from: TaskStatus, to: TaskStatus, actor: "agent" | "operator" | "owner" | "system"): boolean`.

- [ ] **Step 1: Write the failing tests**

`packages/schema/src/lifecycle.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { canTransition, normalizeTaskStatus, TASK_STATUSES } from "./lifecycle.js";

describe("task lifecycle v2", () => {
  it("lists the seven states", () => {
    expect(TASK_STATUSES).toEqual(["draft", "awaiting_authorization", "active", "needs_human", "completed", "expired", "revoked"]);
  });
  it("normalizes legacy strings", () => {
    expect(normalizeTaskStatus("needs-human")).toBe("needs_human");
    expect(normalizeTaskStatus("ACTIVE")).toBe("active");
    expect(normalizeTaskStatus("bogus")).toBeNull();
  });
  it("lets the agent only narrow", () => {
    expect(canTransition("active", "needs_human", "agent")).toBe(true);
    expect(canTransition("active", "completed", "agent")).toBe(true);
    expect(canTransition("needs_human", "active", "agent")).toBe(false);
    expect(canTransition("draft", "active", "agent")).toBe(false);
  });
  it("requires the owner to re-activate and the operator to revoke", () => {
    expect(canTransition("needs_human", "active", "owner")).toBe(true);
    expect(canTransition("active", "revoked", "operator")).toBe(true);
    expect(canTransition("active", "revoked", "agent")).toBe(false);
  });
  it("treats terminal states as terminal", () => {
    for (const from of ["completed", "expired", "revoked"] as const) {
      for (const to of TASK_STATUSES) expect(canTransition(from, to, "operator")).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @custodia/schema test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`packages/schema/src/lifecycle.ts`:
```ts
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

export const normalizeTaskStatus = (raw: string): TaskStatus | null => {
  const key = raw.trim().toLowerCase();
  const mapped = LEGACY[key] ?? key;
  return (TASK_STATUSES as readonly string[]).includes(mapped) ? (mapped as TaskStatus) : null;
};

/** Who may cause which transition. The agent can only narrow (escalate/finish). */
const TRANSITIONS: Record<TaskStatus, Partial<Record<TaskStatus, TaskActor[]>>> = {
  draft: { awaiting_authorization: ["system"], expired: ["system"] },
  awaiting_authorization: { active: ["system"], expired: ["system"], revoked: ["owner", "operator"] },
  active: {
    needs_human: ["agent", "system"],
    completed: ["agent", "system"],
    expired: ["system"],
    revoked: ["owner", "operator"],
  },
  needs_human: { active: ["owner"], completed: ["owner"], expired: ["system"], revoked: ["owner", "operator"] },
  completed: {},
  expired: {},
  revoked: {},
};

export const canTransition = (from: TaskStatus, to: TaskStatus, actor: TaskActor): boolean =>
  (TRANSITIONS[from][to] ?? []).includes(actor);
```
In `packages/schema/src/index.ts` delete the old `TaskStatusSchema`/`TaskStatus` lines and add `export * from "./lifecycle.js";`.
In `packages/ens/src/ops.ts` change the creation record to `"xyz.custodia.status": "draft"`.

- [ ] **Step 4: Run tests, typecheck**

Run: `pnpm --filter @custodia/schema test && pnpm -r typecheck`
Expected: PASS; fix any callers still comparing to `"needs-human"` (guard page reads via `normalizeTaskStatus`).

- [ ] **Step 5: Commit**

```bash
git add packages/schema packages/ens apps/web && git commit -m "feat(schema): seven-state task lifecycle with actor-gated transitions"
```

---

### Task 3: Single-use auth challenges

**Files:**
- Create: `packages/db/src/challenge-store.ts`
- Create: `packages/db/src/challenge-store.test.ts`
- Modify: `apps/web/app/api/auth/session.ts` (`verifyChallenge` gains `store`)
- Modify: `apps/web/app/api/auth/session.test.ts`
- Modify: `apps/web/app/api/auth/verify/route.ts`

**Interfaces:**
- Produces: `interface ChallengeStore { consume(nonce: string, meta: { conversationId: string; address: string }): Promise<boolean> }` (true = first use); `PostgresChallengeStore`.
- Consumes: `auth_challenges` table (Task 1); `challengeNonce` already derived in `session.ts`.

- [ ] **Step 1: Failing store test**

`packages/db/src/challenge-store.test.ts`:
```ts
import { afterAll, beforeAll, expect, it } from "vitest";
import { PostgresChallengeStore } from "./challenge-store.js";
import { createTestDb } from "./test/pglite.js";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { ctx = await createTestDb(); });
afterAll(async () => { await ctx.close(); });

it("consumes a nonce exactly once", async () => {
  const store = new PostgresChallengeStore(ctx.db);
  const meta = { conversationId: "c1", address: "0xabc" };
  expect(await store.consume("n1", meta)).toBe(true);
  expect(await store.consume("n1", meta)).toBe(false);
  expect(await store.consume("n2", meta)).toBe(true);
});
```

- [ ] **Step 2: Run — FAIL (module missing)**

Run: `pnpm --filter @custodia/db test`

- [ ] **Step 3: Implement the store**

`packages/db/src/challenge-store.ts`:
```ts
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema.js";

export interface ChallengeStore {
  /** Returns true the first time a nonce is consumed, false on any replay. */
  consume(nonce: string, meta: { conversationId: string; address: string }): Promise<boolean>;
}

type AnyDb = PgDatabase<PgQueryResultHKT, typeof schema>;

export class PostgresChallengeStore implements ChallengeStore {
  constructor(private readonly db: AnyDb) {}
  async consume(nonce: string, meta: { conversationId: string; address: string }): Promise<boolean> {
    const inserted = await this.db
      .insert(schema.authChallenges)
      .values({ nonce, conversationId: meta.conversationId, address: meta.address.toLowerCase() })
      .onConflictDoNothing({ target: schema.authChallenges.nonce })
      .returning({ nonce: schema.authChallenges.nonce });
    return inserted.length === 1;
  }
}
```
Export from `packages/db/src/index.ts`: `export { type ChallengeStore, PostgresChallengeStore } from "./challenge-store.js";`

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Failing session test for replay**

Add to `apps/web/app/api/auth/session.test.ts`:
```ts
it("rejects a replayed challenge when the store has consumed it", async () => {
  vi.stubEnv("SESSION_SECRET", "test-session-secret");
  const seen = new Set<string>();
  const store = { consume: async (nonce: string) => (seen.has(nonce) ? false : (seen.add(nonce), true)) };
  const challenge = createChallenge({ address: account.address, agent, conversationId });
  const signature = await account.signMessage({ message: challenge.message });
  const params = { address: account.address, agent, conversationId, message: challenge.message, signature, store };
  await expect(verifyChallenge(params)).resolves.toBeTruthy();
  await expect(verifyChallenge(params)).rejects.toThrow("already been used");
});
```

- [ ] **Step 6: Run — FAIL (store not a parameter)**

- [ ] **Step 7: Thread the store through `verifyChallenge`**

In `session.ts`, add `store?: ChallengeStore` to the params type (import type from `@custodia/db`), and after `verifyMessage` succeeds:
```ts
  const nonce = fieldFrom(params.message, "Nonce");
  if (params.store && nonce) {
    const first = await params.store.consume(nonce, { conversationId: params.conversationId, address });
    if (!first) throw new AuthError("This challenge has already been used — request a new one.");
  }
```
In `verify/route.ts` pass `store: new PostgresChallengeStore(createDb())` (lazy singleton like the chat route's cache).

- [ ] **Step 8: Run web tests + typecheck — PASS. Commit**

```bash
git add packages/db apps/web && git commit -m "feat(auth): single-use challenges via consumed-nonce table"
```

---

### Task 4: Runtime primitives — runs, events, jobs, proposals

**Files:**
- Create: `packages/runtime/package.json`, `tsconfig.json`, `vitest.config.ts`
- Create: `packages/runtime/src/runs.ts`, `jobs.ts`, `proposals.ts`, `index.ts`
- Create: `packages/runtime/src/runs.test.ts`, `jobs.test.ts`, `proposals.test.ts`
- Create: `packages/db/src/pooled.ts` (+ export)

**Interfaces:**
- Produces (all take `db: AnyDb` as first arg):
  - `createRun(db, { conversationId, ownerWallet, kind: "chat", clientRequestId, input }) → Promise<{ runId: string; created: boolean }>`
  - `appendEvent(db, runId, { stage, type, payload? }) → Promise<{ seq: number }>`
  - `listEvents(db, runId, afterSeq = 0) → Promise<Array<{ seq; stage; type; payload; createdAt }>>`
  - `completeRun(db, runId, output)`, `failRun(db, runId, error)`
  - `enqueueJob(db, { kind, payload, dedupeKey?, runAfter? }) → Promise<{ jobId: number; created: boolean }>`
  - `leaseJob(db, { workerId, leaseSeconds = 60, kinds? }) → Promise<Job | null>`
  - `heartbeatJob(db, jobId, workerId, leaseSeconds)`, `completeJob(db, jobId, workerId)`, `failJob(db, jobId, workerId, error, { maxAttempts = 5 })`
  - `proposalHash(body) → 0x…`, `storeProposal(db, { runId, taskId, ownerWallet, body }) → { proposalId, hash }`, `loadProposal(db, proposalId)`
- Consumes: Task 1 tables.

- [ ] **Step 1: Scaffold the package**

`packages/runtime/package.json`:
```json
{
  "name": "@custodia/runtime",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": { "types": "./src/index.ts", "default": "./src/index.ts" } },
  "scripts": { "typecheck": "tsc -p tsconfig.json --noEmit", "test": "vitest run" },
  "dependencies": {
    "@custodia/db": "workspace:*",
    "@custodia/schema": "workspace:*",
    "drizzle-orm": "^0.44.0",
    "viem": "catalog:"
  },
  "devDependencies": { "vitest": "^3.0.0" }
}
```
`tsconfig.json` and `vitest.config.ts`: copy from `packages/policy`. Add the package to `pnpm-workspace.yaml` if it globs `packages/*` it is already included. Run `pnpm install`.

- [ ] **Step 2: Pooled DB for the worker**

`packages/db/src/pooled.ts`:
```ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import { NotImplementedError } from "@custodia/schema";
import * as schema from "./schema.js";

neonConfig.webSocketConstructor = ws;

/** Transactional driver (WebSocket). The HTTP driver cannot run transactions or FOR UPDATE. */
export const createPooledDb = (url: string | undefined = process.env.DATABASE_URL) => {
  if (!url) throw new NotImplementedError("DATABASE_URL (Neon Postgres)");
  return drizzle(new Pool({ connectionString: url }), { schema });
};
export type PooledDb = ReturnType<typeof createPooledDb>;
```
`cd packages/db && pnpm add ws && pnpm add -D @types/ws`. Export from index.

- [ ] **Step 3: Failing runs test**

`packages/runtime/src/runs.test.ts`:
```ts
import { createTestDb } from "@custodia/db";
import { afterAll, beforeAll, expect, it } from "vitest";
import { appendEvent, completeRun, createRun, listEvents } from "./runs.js";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { ctx = await createTestDb(); });
afterAll(async () => { await ctx.close(); });

const base = { conversationId: "c1", ownerWallet: "0xowner", kind: "chat" as const, input: { message: "hi" } };

it("is idempotent on (conversation, clientRequestId)", async () => {
  const a = await createRun(ctx.db, { ...base, clientRequestId: "r1" });
  const b = await createRun(ctx.db, { ...base, clientRequestId: "r1" });
  expect(a.created).toBe(true);
  expect(b).toEqual({ runId: a.runId, created: false });
});

it("appends ordered events and completes", async () => {
  const { runId } = await createRun(ctx.db, { ...base, clientRequestId: "r2" });
  await appendEvent(ctx.db, runId, { stage: "fetching_context", type: "stage" });
  await appendEvent(ctx.db, runId, { stage: "fetching_context", type: "text", payload: { delta: "hi" } });
  await completeRun(ctx.db, runId, { ok: true });
  const events = await listEvents(ctx.db, runId, 0);
  expect(events.map((e) => e.seq)).toEqual([1, 2, 3]);
  expect(events.at(-1)).toMatchObject({ stage: "done", type: "result" });
  expect(await listEvents(ctx.db, runId, 2)).toHaveLength(1);
});
```

- [ ] **Step 4: Run — FAIL**

- [ ] **Step 5: Implement runs**

`packages/runtime/src/runs.ts`:
```ts
import { randomUUID } from "node:crypto";
import { tables } from "@custodia/db";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

export type AnyDb = PgDatabase<PgQueryResultHKT, typeof tables>;
export type RunStage =
  | "queued" | "inspecting_wallet" | "fetching_context" | "paying_analysis" | "generating_ui"
  | "awaiting_signature" | "publishing" | "done" | "failed";

export async function createRun(
  db: AnyDb,
  params: { conversationId: string; ownerWallet: string; kind: "chat"; clientRequestId: string; input: unknown },
): Promise<{ runId: string; created: boolean }> {
  const id = randomUUID();
  const inserted = await db
    .insert(tables.runs)
    .values({ id, ...params, input: params.input as object })
    .onConflictDoNothing({ target: [tables.runs.conversationId, tables.runs.clientRequestId] })
    .returning({ id: tables.runs.id });
  if (inserted.length === 1) return { runId: id, created: true };
  const [existing] = await db
    .select({ id: tables.runs.id })
    .from(tables.runs)
    .where(and(eq(tables.runs.conversationId, params.conversationId), eq(tables.runs.clientRequestId, params.clientRequestId)));
  if (!existing) throw new Error("run vanished between insert and select");
  return { runId: existing.id, created: false };
}

export async function appendEvent(
  db: AnyDb,
  runId: string,
  event: { stage: RunStage; type: "text" | "tool" | "stage" | "result" | "error"; payload?: unknown },
): Promise<{ seq: number }> {
  const [row] = await db
    .insert(tables.runEvents)
    .values({
      runId,
      seq: sql<number>`(select coalesce(max(${tables.runEvents.seq}), 0) + 1 from ${tables.runEvents} where ${tables.runEvents.runId} = ${runId})`,
      stage: event.stage,
      type: event.type,
      payload: event.payload as object | undefined,
    })
    .returning({ seq: tables.runEvents.seq });
  return { seq: row!.seq };
}

export const listEvents = (db: AnyDb, runId: string, afterSeq = 0) =>
  db
    .select({ seq: tables.runEvents.seq, stage: tables.runEvents.stage, type: tables.runEvents.type, payload: tables.runEvents.payload, createdAt: tables.runEvents.createdAt })
    .from(tables.runEvents)
    .where(and(eq(tables.runEvents.runId, runId), gt(tables.runEvents.seq, afterSeq)))
    .orderBy(asc(tables.runEvents.seq));

export async function completeRun(db: AnyDb, runId: string, output: unknown): Promise<void> {
  await db.update(tables.runs).set({ status: "done", output: output as object, finishedAt: new Date() }).where(eq(tables.runs.id, runId));
  await appendEvent(db, runId, { stage: "done", type: "result", payload: output });
}

export async function failRun(db: AnyDb, runId: string, error: string): Promise<void> {
  await db.update(tables.runs).set({ status: "failed", error, finishedAt: new Date() }).where(eq(tables.runs.id, runId));
  await appendEvent(db, runId, { stage: "failed", type: "error", payload: { error } });
}
```

- [ ] **Step 6: Run — PASS**

- [ ] **Step 7: Failing jobs test**

`packages/runtime/src/jobs.test.ts`:
```ts
import { createTestDb } from "@custodia/db";
import { afterAll, beforeAll, expect, it } from "vitest";
import { completeJob, enqueueJob, failJob, leaseJob } from "./jobs.js";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { ctx = await createTestDb(); });
afterAll(async () => { await ctx.close(); });

it("dedupes live jobs and leases exactly once", async () => {
  const a = await enqueueJob(ctx.db, { kind: "chat.run", payload: { runId: "r1" }, dedupeKey: "chat.run:r1" });
  const b = await enqueueJob(ctx.db, { kind: "chat.run", payload: { runId: "r1" }, dedupeKey: "chat.run:r1" });
  expect(a.created).toBe(true);
  expect(b).toEqual({ jobId: a.jobId, created: false });
  const first = await leaseJob(ctx.db, { workerId: "w1" });
  const second = await leaseJob(ctx.db, { workerId: "w2" });
  expect(first?.id).toBe(a.jobId);
  expect(second).toBeNull();
  await completeJob(ctx.db, a.jobId, "w1");
  expect(await leaseJob(ctx.db, { workerId: "w1" })).toBeNull();
});

it("re-leases after the lease expires and backs off on failure", async () => {
  const { jobId } = await enqueueJob(ctx.db, { kind: "ens.publish", payload: {}, dedupeKey: "ens.publish:t1" });
  const leased = await leaseJob(ctx.db, { workerId: "w1", leaseSeconds: -1 }); // already expired
  expect(leased?.id).toBe(jobId);
  const again = await leaseJob(ctx.db, { workerId: "w2" });
  expect(again?.id).toBe(jobId); // expired lease is stealable
  await failJob(ctx.db, jobId, "w2", "boom");
  const notYet = await leaseJob(ctx.db, { workerId: "w3" });
  expect(notYet).toBeNull(); // run_after is in the future
});
```

- [ ] **Step 8: Run — FAIL**

- [ ] **Step 9: Implement jobs (raw SQL for the lease — SKIP LOCKED)**

`packages/runtime/src/jobs.ts`:
```ts
import { tables } from "@custodia/db";
import { and, eq, sql } from "drizzle-orm";
import type { AnyDb } from "./runs.js";

export type Job = typeof tables.jobs.$inferSelect;

export async function enqueueJob(
  db: AnyDb,
  params: { kind: string; payload: unknown; dedupeKey?: string; runAfter?: Date },
): Promise<{ jobId: number; created: boolean }> {
  if (params.dedupeKey) {
    const [live] = await db
      .select({ id: tables.jobs.id })
      .from(tables.jobs)
      .where(and(eq(tables.jobs.dedupeKey, params.dedupeKey), sql`${tables.jobs.status} in ('queued','leased')`))
      .limit(1);
    if (live) return { jobId: live.id, created: false };
  }
  const [row] = await db
    .insert(tables.jobs)
    .values({ kind: params.kind, payload: params.payload as object, dedupeKey: params.dedupeKey, runAfter: params.runAfter ?? new Date() })
    .returning({ id: tables.jobs.id });
  return { jobId: row!.id, created: true };
}

/** Atomically claim one runnable job. Expired leases are stealable. */
export async function leaseJob(
  db: AnyDb,
  params: { workerId: string; leaseSeconds?: number; kinds?: string[] },
): Promise<Job | null> {
  const lease = params.leaseSeconds ?? 60;
  const kindFilter = params.kinds?.length ? sql`and kind in (${sql.join(params.kinds.map((k) => sql`${k}`), sql`, `)})` : sql``;
  const rows = await db.execute<Job>(sql`
    update jobs set status = 'leased', leased_by = ${params.workerId},
      leased_until = now() + make_interval(secs => ${lease}), attempts = attempts + 1
    where id = (
      select id from jobs
      where (status = 'queued' or (status = 'leased' and leased_until < now()))
        and run_after <= now() ${kindFilter}
      order by id
      limit 1
      for update skip locked
    )
    returning *`);
  const row = (rows as unknown as { rows?: Job[] }).rows?.[0] ?? (rows as unknown as Job[])[0];
  return row ?? null;
}

export const heartbeatJob = (db: AnyDb, jobId: number, workerId: string, leaseSeconds = 60) =>
  db.update(tables.jobs)
    .set({ leasedUntil: sql`now() + make_interval(secs => ${leaseSeconds})` })
    .where(and(eq(tables.jobs.id, jobId), eq(tables.jobs.leasedBy, workerId)));

export const completeJob = (db: AnyDb, jobId: number, workerId: string) =>
  db.update(tables.jobs)
    .set({ status: "done", finishedAt: new Date(), leasedBy: null, leasedUntil: null })
    .where(and(eq(tables.jobs.id, jobId), eq(tables.jobs.leasedBy, workerId)));

export async function failJob(db: AnyDb, jobId: number, workerId: string, error: string, opts: { maxAttempts?: number } = {}) {
  const max = opts.maxAttempts ?? 5;
  const [job] = await db.select({ attempts: tables.jobs.attempts }).from(tables.jobs).where(eq(tables.jobs.id, jobId));
  const attempts = job?.attempts ?? max;
  const terminal = attempts >= max;
  const backoffS = Math.min(2 ** attempts, 60);
  await db.update(tables.jobs)
    .set({
      status: terminal ? "failed" : "queued",
      lastError: error.slice(0, 2000),
      leasedBy: null,
      leasedUntil: null,
      finishedAt: terminal ? new Date() : null,
      runAfter: sql`now() + make_interval(secs => ${backoffS})`,
    })
    .where(and(eq(tables.jobs.id, jobId), eq(tables.jobs.leasedBy, workerId)));
}
```
Note: `db.execute` returns driver-shaped results (`{ rows }` on neon-serverless, an array on PGlite); the two-way read above covers both.

- [ ] **Step 10: Run — PASS**

- [ ] **Step 11: Failing proposals test**

`packages/runtime/src/proposals.test.ts`:
```ts
import { createTestDb } from "@custodia/db";
import { afterAll, beforeAll, expect, it } from "vitest";
import { loadProposal, proposalHash, storeProposal } from "./proposals.js";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { ctx = await createTestDb(); });
afterAll(async () => { await ctx.close(); });

it("hashes canonically (key order does not matter)", () => {
  expect(proposalHash({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(proposalHash({ a: [2, { c: 4, d: 3 }], b: 1 }));
});

it("stores an immutable version and reloads it by id", async () => {
  const body = { market: { pair: "ETH/USDC" }, uiSpec: { version: 1 }, proposal: { taskId: "t1" } };
  const stored = await storeProposal(ctx.db, { runId: "r1", taskId: "t1", ownerWallet: "0xowner", body });
  const loaded = await loadProposal(ctx.db, stored.proposalId);
  expect(loaded?.hash).toBe(proposalHash(body));
  expect(loaded?.body).toEqual(body);
  await expect(storeProposal(ctx.db, { runId: "r1", taskId: "t1", ownerWallet: "0xowner", body })).rejects.toThrow();
});
```

- [ ] **Step 12: Run — FAIL**

- [ ] **Step 13: Implement proposals**

`packages/runtime/src/proposals.ts`:
```ts
import { randomUUID } from "node:crypto";
import { tables } from "@custodia/db";
import { eq } from "drizzle-orm";
import { keccak256, toHex } from "viem";
import type { AnyDb } from "./runs.js";

/** Canonical JSON: sorted keys, no whitespace — the same bytes for the same content. */
export const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]]))
      : v,
  );

export const proposalHash = (body: unknown): `0x${string}` => keccak256(toHex(canonicalJson(body)));

export async function storeProposal(
  db: AnyDb,
  params: { runId: string; taskId: string; ownerWallet: string; body: unknown; version?: number },
): Promise<{ proposalId: string; hash: `0x${string}` }> {
  const id = randomUUID();
  const hash = proposalHash(params.body);
  await db.insert(tables.proposals).values({
    id, runId: params.runId, taskId: params.taskId, ownerWallet: params.ownerWallet,
    version: params.version ?? 1, hash, body: params.body as object,
  }); // unique (task_id, version) makes re-storing the same version throw — proposals are immutable
  return { proposalId: id, hash };
}

export const loadProposal = async (db: AnyDb, proposalId: string) =>
  (await db.select().from(tables.proposals).where(eq(tables.proposals.id, proposalId)).limit(1))[0] ?? null;
```
`packages/runtime/src/index.ts` re-exports everything from `runs.ts`, `jobs.ts`, `proposals.ts`.

- [ ] **Step 14: Run all runtime tests + typecheck — PASS. Commit**

```bash
git add packages/runtime packages/db pnpm-lock.yaml pnpm-workspace.yaml && git commit -m "feat(runtime): runs, run events, leased jobs and immutable proposals on Postgres"
```

---

### Task 5: Handler registry and the chat job handler

**Files:**
- Create: `packages/runtime/src/registry.ts`, `packages/runtime/src/handlers/chat.ts`
- Create: `packages/runtime/src/handlers/chat.test.ts`
- Modify: `packages/runtime/package.json` (add `@custodia/agent`, `@custodia/graph`)

**Interfaces:**
- Produces: `type JobHandler = (ctx: { db: AnyDb; job: Job; heartbeat(): Promise<void> }) => Promise<void>`; `class HandlerRegistry { register(kind, handler); handlerFor(kind) }`; `tick(db, registry, workerId) → Promise<"idle" | "ran">`; `chatHandler` for kind `chat.run` with payload `{ runId }`.
- Consumes: `runAgent` (`@custodia/agent`), `PostgresMarketCache`, Task 4 primitives, `getUserLabel/makeTaskName` — move these two from `apps/web/app/api/identity.ts` into `packages/ens/src/identity.ts` so the worker can use them (pure functions, no Next imports).

- [ ] **Step 1: Failing handler test (mocked agent, real PGlite)**

`packages/runtime/src/handlers/chat.test.ts`:
```ts
import { createTestDb } from "@custodia/db";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runAgent: vi.fn() }));
vi.mock("@custodia/agent", () => ({ runAgent: mocks.runAgent }));
vi.mock("@custodia/ens", async (orig) => ({ ...(await orig<object>()), getUserLabel: async () => "alice", makeTaskName: (t: string, u: string, p: string) => `${t}.${u}.${p}` }));

import { enqueueJob, leaseJob } from "../jobs.js";
import { createRun, listEvents } from "../runs.js";
import { HandlerRegistry, tick } from "../registry.js";
import { chatHandler } from "./chat.js";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { ctx = await createTestDb(); process.env.ENS_PARENT_NAME = "custodia.eth"; });
afterAll(async () => { await ctx.close(); });

it("runs the agent, streams stages, stores the proposal and completes the run", async () => {
  mocks.runAgent.mockImplementation(async ({ onEvent }) => {
    onEvent({ type: "tool", name: "get_market_context", input: {} });
    onEvent({ type: "tool", name: "paid_risk_request", input: {} });
    onEvent({ type: "text", delta: "Here is your guard." });
    return { market: { pair: "ETH/USDC" }, uiSpec: { intent: "configure_portfolio_guard", components: [], rationale: "r" }, receipts: [], rationale: "r" };
  });
  const { runId } = await createRun(ctx.db, { conversationId: "c1", ownerWallet: "0xowner", kind: "chat", clientRequestId: "q1", input: { messages: [{ role: "user", content: "guard my eth" }], agent: "0xagent" } });
  await enqueueJob(ctx.db, { kind: "chat.run", payload: { runId }, dedupeKey: `chat.run:${runId}` });
  const registry = new HandlerRegistry().register("chat.run", chatHandler);
  expect(await tick(ctx.db, registry, "w1")).toBe("ran");
  const events = await listEvents(ctx.db, runId);
  expect(events.map((e) => e.stage)).toEqual(expect.arrayContaining(["fetching_context", "paying_analysis", "awaiting_signature", "done"]));
  const done = events.at(-1)!.payload as { proposalId: string; proposalHash: string; ensName: string };
  expect(done.proposalId).toMatch(/[0-9a-f-]{36}/);
  expect(done.ensName).toMatch(/\.alice\.custodia\.eth$/);
  expect(await tick(ctx.db, registry, "w1")).toBe("idle");
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement registry + tick**

`packages/runtime/src/registry.ts`:
```ts
import { completeJob, failJob, heartbeatJob, type Job, leaseJob } from "./jobs.js";
import type { AnyDb } from "./runs.js";

export type JobHandler = (ctx: { db: AnyDb; job: Job; heartbeat: () => Promise<void> }) => Promise<void>;

export class HandlerRegistry {
  private readonly handlers = new Map<string, JobHandler>();
  register(kind: string, handler: JobHandler): this { this.handlers.set(kind, handler); return this; }
  handlerFor(kind: string): JobHandler | undefined { return this.handlers.get(kind); }
  kinds(): string[] { return [...this.handlers.keys()]; }
}

/** Lease one job and run it to completion or failure. Never throws. */
export async function tick(db: AnyDb, registry: HandlerRegistry, workerId: string): Promise<"idle" | "ran"> {
  const job = await leaseJob(db, { workerId, kinds: registry.kinds() });
  if (!job) return "idle";
  const handler = registry.handlerFor(job.kind);
  if (!handler) { await failJob(db, job.id, workerId, `no handler for ${job.kind}`, { maxAttempts: 1 }); return "ran"; }
  try {
    await handler({ db, job, heartbeat: async () => { await heartbeatJob(db, job.id, workerId); } });
    await completeJob(db, job.id, workerId);
  } catch (err) {
    await failJob(db, job.id, workerId, err instanceof Error ? err.message : String(err));
  }
  return "ran";
}
```

- [ ] **Step 4: Implement the chat handler**

`packages/runtime/src/handlers/chat.ts`:
```ts
import { randomBytes } from "node:crypto";
import { runAgent } from "@custodia/agent";
import { PostgresMarketCache, tables } from "@custodia/db";
import { getUserLabel, makeTaskName } from "@custodia/ens";
import { eq } from "drizzle-orm";
import type { JobHandler } from "../registry.js";
import { storeProposal } from "../proposals.js";
import { appendEvent, completeRun, failRun, type RunStage } from "../runs.js";

const STAGE_FOR_TOOL: Record<string, RunStage> = {
  get_market_context: "fetching_context",
  paid_risk_request: "paying_analysis",
  emit_ui_spec: "generating_ui",
};

/** kind: chat.run — payload { runId }. Runs the agent once and records a proposal. */
export const chatHandler: JobHandler = async ({ db, job, heartbeat }) => {
  const { runId } = job.payload as { runId: string };
  const [run] = await db.select().from(tables.runs).where(eq(tables.runs.id, runId)).limit(1);
  if (!run) throw new Error(`run ${runId} not found`);
  if (run.status === "done") return; // duplicate delivery — nothing to do
  await db.update(tables.runs).set({ status: "running" }).where(eq(tables.runs.id, runId));

  const input = run.input as { messages: Array<{ role: "user" | "assistant"; content: string }>; agent: `0x${string}` };
  let stage: RunStage = "inspecting_wallet";
  await appendEvent(db, runId, { stage, type: "stage" });
  try {
    const result = await runAgent({
      messages: input.messages,
      owner: run.ownerWallet as `0x${string}`,
      agent: input.agent,
      cache: new PostgresMarketCache(db as never),
      onEvent: (event) => {
        const next = event.type === "tool" && event.name ? STAGE_FOR_TOOL[event.name] : undefined;
        if (next && next !== stage) { stage = next; void appendEvent(db, runId, { stage, type: "stage" }); }
        void appendEvent(db, runId, { stage, type: event.type, payload: event });
        void heartbeat();
      },
    });
    if (!result.uiSpec || !result.market) throw new Error("agent finished without a UI spec");

    const taskId = randomBytes(4).toString("hex");
    const userLabel = await getUserLabel(run.ownerWallet as `0x${string}`);
    const parentName = process.env.ENS_PARENT_NAME?.trim().toLowerCase() || "custodia.eth";
    const ensName = makeTaskName(taskId, userLabel, parentName);
    const proposal = { taskId, userLabel, parentName, ensName, owner: run.ownerWallet, agent: input.agent };
    await db.insert(tables.tasks).values({ id: taskId, userWallet: run.ownerWallet, ensName, template: "portfolio_guard", status: "draft" });
    const { proposalId, hash } = await storeProposal(db, { runId, taskId, ownerWallet: run.ownerWallet, body: { market: result.market, uiSpec: result.uiSpec, proposal } });
    await appendEvent(db, runId, { stage: "awaiting_signature", type: "stage" });
    await completeRun(db, runId, { proposalId, proposalHash: hash, ensName, taskId, rationale: result.rationale, receipts: result.receipts });
  } catch (err) {
    await failRun(db, runId, err instanceof Error ? err.message : String(err));
    throw err;
  }
};
```
Move `getUserLabel`/`makeTaskName` from `apps/web/app/api/identity.ts` into `packages/ens/src/identity.ts` (same code), export from `@custodia/ens`, and re-import them in `identity.ts`.

- [ ] **Step 5: Run — PASS. Typecheck. Commit**

```bash
git add packages/runtime packages/ens apps/web && git commit -m "feat(runtime): handler registry, tick loop and the chat.run handler with staged run events"
```

---

### Task 6: The worker process

**Files:**
- Create: `apps/worker/package.json`, `tsconfig.json`, `src/main.ts`
- Modify: root `package.json` (`dev` runs the worker too; `worker` script)

**Interfaces:**
- Consumes: `createPooledDb`, `HandlerRegistry`, `tick`, `chatHandler`, `ensPublishHandler` (Task 8).

- [ ] **Step 1: Scaffold**

`apps/worker/package.json`:
```json
{
  "name": "@custodia/worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": { "dev": "tsx watch src/main.ts", "start": "tsx src/main.ts", "typecheck": "tsc -p tsconfig.json --noEmit", "test": "vitest run --passWithNoTests" },
  "dependencies": { "@custodia/db": "workspace:*", "@custodia/runtime": "workspace:*", "dotenv": "^17.4.2" },
  "devDependencies": { "tsx": "^4.19.0" }
}
```
`tsconfig.json`: copy from `apps/risk-api`.

- [ ] **Step 2: Write the loop**

`apps/worker/src/main.ts`:
```ts
import { resolve } from "node:path";
import dotenv from "dotenv";
import { createPooledDb } from "@custodia/db";
import { chatHandler, ensPublishHandler, HandlerRegistry, tick } from "@custodia/runtime";

dotenv.config({ path: resolve(process.cwd(), "../../.env"), quiet: true });

const workerId = `${process.env.HOSTNAME ?? "local"}-${process.pid}`;
const IDLE_MS = 1_000;
const db = createPooledDb();
const registry = new HandlerRegistry().register("chat.run", chatHandler).register("ens.publish", ensPublishHandler);

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => { stopping = true; });

console.log(`[worker ${workerId}] handling ${registry.kinds().join(", ")}`);
while (!stopping) {
  const outcome = await tick(db, registry, workerId);
  if (outcome === "idle") await new Promise((r) => setTimeout(r, IDLE_MS));
}
console.log(`[worker ${workerId}] stopped`);
```
Root `package.json`: `"dev": "concurrently -n risk-api,web,worker -c blue,green,magenta \"pnpm --filter @custodia/risk-api dev\" \"pnpm --filter @custodia/web dev\" \"pnpm --filter @custodia/worker dev\""` and `"worker": "pnpm --filter @custodia/worker start"`.

- [ ] **Step 3: Smoke it**

Run: `pnpm worker` (Ctrl-C after it prints the handler list). Expected: `[worker local-<pid>] handling chat.run, ens.publish`, then `stopped` on Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add apps/worker package.json pnpm-lock.yaml && git commit -m "feat(worker): dedicated job loop with SIGTERM-safe shutdown"
```

---

### Task 7: Chat route enqueues; run events route

**Files:**
- Modify: `apps/web/app/api/chat/route.ts`
- Create: `apps/web/app/api/runs/[id]/events/route.ts`
- Modify: `apps/web/app/api/chat/route.test.ts`
- Create: `apps/web/app/api/runs/[id]/events/route.test.ts`

**Interfaces:**
- `POST /api/chat` body `{ conversationId, clientRequestId, message, messages? }` → `202 { runId, created }`.
- `GET /api/runs/:id/events?after=<seq>` → `200 { runId, status, events: [...] }`; 401 without a session for the run's owner; 404 unknown run.

- [ ] **Step 1: Rewrite the chat route test**

Replace the "dispatches a valid prompt" case in `chat/route.test.ts` with:
```ts
vi.mock("@custodia/runtime", () => ({ createRun: mocks.createRun, enqueueJob: mocks.enqueueJob }));
// in mocks: createRun: vi.fn(async () => ({ runId: "run-1", created: true })), enqueueJob: vi.fn(async () => ({ jobId: 1, created: true }))

it("persists the request as a run and returns 202 with the run id", async () => {
  const res = await POST(new Request("http://x/api/chat", { method: "POST", headers: { "content-type": "application/json", cookie: sessionCookie() },
    body: JSON.stringify({ conversationId, clientRequestId: "11111111-1111-4111-8111-111111111111", message: "guard my eth" }) }));
  expect(res.status).toBe(202);
  expect(await res.json()).toEqual({ runId: "run-1", created: true });
  expect(mocks.createRun).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ conversationId, clientRequestId: "11111111-1111-4111-8111-111111111111", ownerWallet: owner }));
  expect(mocks.enqueueJob).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: "chat.run", dedupeKey: "chat.run:run-1" }));
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Rewrite the route body** (keep validation/session code; replace the `runAgent` block)

```ts
    const { runId, created } = await createRun(getDb(), {
      conversationId: parsed.data.conversationId,
      ownerWallet: owner,
      kind: "chat",
      clientRequestId: parsed.data.clientRequestId,
      input: { messages, agent },
    });
    if (created) await enqueueJob(getDb(), { kind: "chat.run", payload: { runId }, dedupeKey: `chat.run:${runId}` });
    return NextResponse.json({ runId, created }, { status: 202 });
```
Add `clientRequestId: z.string().uuid()` to `ChatRequestSchema`; `getDb()` is a lazy `createDb()` singleton (HTTP driver is fine for inserts).

- [ ] **Step 4: Events route test**

`apps/web/app/api/runs/[id]/events/route.test.ts`:
```ts
import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ listEvents: vi.fn(async () => [{ seq: 1, stage: "fetching_context", type: "stage", payload: null, createdAt: new Date() }]), loadRun: vi.fn() }));
vi.mock("@custodia/db", () => ({ createDb: () => ({}), tables: {} }));
vi.mock("@custodia/runtime", () => ({ listEvents: mocks.listEvents, loadRun: mocks.loadRun }));
import { createSessionToken, SESSION_COOKIE_NAME } from "../../../auth/session";
import { GET } from "./route";
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });

const owner = "0x2222222222222222222222222222222222222222";
const cookie = () => { vi.stubEnv("SESSION_SECRET", "s"); return `${SESSION_COOKIE_NAME}=${createSessionToken({ address: owner, agent: "0x1111111111111111111111111111111111111111", conversationId: "c1", issuedAt: Date.now(), expiresAt: Date.now() + 60_000 })}`; };

it("returns events after a cursor for the run owner", async () => {
  mocks.loadRun.mockResolvedValue({ id: "run-1", ownerWallet: owner, conversationId: "c1", status: "running" });
  const res = await GET(new Request("http://x/api/runs/run-1/events?after=0", { headers: { cookie: cookie() } }), { params: Promise.resolve({ id: "run-1" }) });
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ runId: "run-1", status: "running", events: [{ seq: 1 }] });
  expect(mocks.listEvents).toHaveBeenCalledWith(expect.anything(), "run-1", 0);
});
it("hides runs from other wallets", async () => {
  mocks.loadRun.mockResolvedValue({ id: "run-1", ownerWallet: "0x3333333333333333333333333333333333333333", conversationId: "c1", status: "running" });
  const res = await GET(new Request("http://x/api/runs/run-1/events", { headers: { cookie: cookie() } }), { params: Promise.resolve({ id: "run-1" }) });
  expect(res.status).toBe(404);
});
```
Add `loadRun(db, runId)` to `packages/runtime/src/runs.ts` (select by id, returns row or null) and export it.

- [ ] **Step 5: Implement the events route**

`apps/web/app/api/runs/[id]/events/route.ts`:
```ts
import "../../../../env";
import { createDb } from "@custodia/db";
import { listEvents, loadRun } from "@custodia/runtime";
import { NextResponse } from "next/server";
import { readSessionToken, SESSION_COOKIE_NAME } from "../../../auth/session";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const cookie = request.headers.get("cookie")?.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${SESSION_COOKIE_NAME}=`))?.slice(SESSION_COOKIE_NAME.length + 1);
  const session = readSessionToken(cookie);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const db = createDb();
  const run = await loadRun(db, id);
  if (!run || run.ownerWallet.toLowerCase() !== session.address.toLowerCase()) {
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  }
  const after = Number(new URL(request.url).searchParams.get("after") ?? "0") || 0;
  const events = await listEvents(db, id, after);
  return NextResponse.json({ runId: id, status: run.status, events });
}
```

- [ ] **Step 6: Run web tests + typecheck — PASS. Commit**

```bash
git add apps/web packages/runtime && git commit -m "feat(web): chat enqueues a durable run; events polling endpoint"
```

---

### Task 8: Mandate route bound to the stored proposal; ens.publish job

**Files:**
- Modify: `apps/web/app/api/mandate/route.ts`
- Modify: `apps/web/app/api/mandate/route.test.ts`
- Create: `packages/runtime/src/handlers/ens-publish.ts`, `ens-publish.test.ts`
- Modify: `packages/runtime/package.json` (add `@custodia/ens`)

**Interfaces:**
- `POST /api/mandate` body `{ conversationId, proposalId, mandate, signature }` → `202 { taskId, ensName, mandateHash, jobId }`. Market/UI come from the stored proposal only.
- `ensPublishHandler` kind `ens.publish`, payload `{ taskId, mandateId }`; dedupe key `ens.publish:<taskId>`; on success sets `tasks.status = active`, writes `receipts` rows; on terminal failure sets `needs_human` and an `outbox` row.

- [ ] **Step 1: Failing mandate-route test**

Replace the existing case in `mandate/route.test.ts` (keep its mocks for viem/ens) with a test that: mocks `@custodia/runtime` `loadProposal` to return a body whose `uiSpec` has `range_slider{min:1.4,max:5.4}` and `amount_selector{max:10000}` and `proposal.taskId = "abcd1234"`; posts a mandate with `max_drawdown_pct = 5.4`, `max_trade_usd = 10000`, a valid signature (sign with a viem test account in the test); expects `202` and `enqueueJob` called with `kind: "ens.publish"`. Add a second case: `max_trade_usd = 20000` → `400` with error containing `outside the proposal bounds`. Add a third: body includes `market`/`uiSpec` → they are ignored (assert `createTask` not called, `enqueueJob` still called once).

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Rewrite the route's core**

Replace `MandateRequestSchema` with `{ conversationId: uuid, proposalId: uuid, mandate: MandateSchema, signature }` (`.strict()` so extra fields like `market` are rejected with 400 — that satisfies "never accept browser-supplied evidence"). After signature verification:
```ts
    const proposal = await loadProposal(db, parsed.data.proposalId);
    if (!proposal || proposal.ownerWallet.toLowerCase() !== session.address.toLowerCase()) {
      return NextResponse.json({ error: "Unknown proposal." }, { status: 404 });
    }
    const body = proposal.body as { uiSpec: UISpec; proposal: { taskId: string; ensName: string } };
    if (mandate.taskId !== body.proposal.taskId || mandate.ens !== body.proposal.ensName) {
      return NextResponse.json({ error: "The mandate does not match the proposal." }, { status: 400 });
    }
    const bounds = boundsFrom(body.uiSpec); // { drawdownMax, tradeMax } from range_slider/amount_selector
    const dd = mandate.constraints.find((c) => c.type === "custodia.max_drawdown_pct.1");
    const tr = mandate.constraints.find((c) => c.type === "custodia.max_trade_usd.1");
    if ((dd && dd.value > bounds.drawdownMax) || (tr && tr.value > bounds.tradeMax)) {
      return NextResponse.json({ error: "Mandate limits are outside the proposal bounds." }, { status: 400 });
    }
    const [row] = await db.insert(tables.mandates).values({ taskId: mandate.taskId, version: 1, typedData: mandate, signature, hash: mandateDigest(mandate) }).returning({ id: tables.mandates.id });
    await db.update(tables.tasks).set({ status: "awaiting_authorization" }).where(eq(tables.tasks.id, mandate.taskId));
    const { jobId } = await enqueueJob(db, { kind: "ens.publish", payload: { taskId: mandate.taskId, mandateId: row!.id, proposalId: proposal.id }, dedupeKey: `ens.publish:${mandate.taskId}` });
    return NextResponse.json({ taskId: mandate.taskId, ensName: mandate.ens, mandateHash: mandateDigest(mandate), jobId }, { status: 202 });
```
`boundsFrom`:
```ts
const boundsFrom = (spec: UISpec) => ({
  drawdownMax: spec.components.find((c) => c.type === "range_slider")?.max ?? 0,
  tradeMax: spec.components.find((c) => c.type === "amount_selector")?.max ?? 0,
});
```

- [ ] **Step 4: Failing ens-publish handler test**

`packages/runtime/src/handlers/ens-publish.test.ts`: PGlite db; insert a task (`awaiting_authorization`), a mandate row, a proposal row with `chart`-able market + uiSpec; mock `@custodia/ens` `createTask` to resolve `{ name, recordsTxId: "0xaa", txId: "0xbb" }` and `loadEnsConfig` to return a stub; run `ensPublishHandler`; expect task status `active`, two `receipts` rows of kind `ens_tx`, and that a second run with the same job is a no-op (createTask called once). Second test: `createTask` rejects → handler throws (so `failJob` backs off) and task stays `awaiting_authorization`.

- [ ] **Step 5: Implement**

`packages/runtime/src/handlers/ens-publish.ts`:
```ts
import { tables } from "@custodia/db";
import { createTask, loadEnsConfig } from "@custodia/ens";
import type { Mandate, MarketContext, UISpec } from "@custodia/schema";
import { mandateDigest } from "@custodia/schema";
import { and, eq } from "drizzle-orm";
import type { JobHandler } from "../registry.js";

const chartPayload = (market: MarketContext, uiSpec: UISpec): string => {
  const chart = uiSpec.components.find((c) => c.type === "price_chart");
  return JSON.stringify({ schema: "custodia.chart.1", source: "The Graph", pair: market.pair, range: chart?.type === "price_chart" ? chart.range : "24h", fetchedAt: market.fetchedAt, points: market.hourly });
};

/** kind: ens.publish — payload { taskId, mandateId, proposalId }. Idempotent: an active task is a no-op. */
export const ensPublishHandler: JobHandler = async ({ db, job }) => {
  const { taskId, mandateId, proposalId } = job.payload as { taskId: string; mandateId: number; proposalId: string };
  const [task] = await db.select().from(tables.tasks).where(eq(tables.tasks.id, taskId)).limit(1);
  if (!task) throw new Error(`task ${taskId} not found`);
  if (task.status === "active") return;
  const [mandateRow] = await db.select().from(tables.mandates).where(and(eq(tables.mandates.id, mandateId), eq(tables.mandates.taskId, taskId))).limit(1);
  const [proposal] = await db.select().from(tables.proposals).where(eq(tables.proposals.id, proposalId)).limit(1);
  if (!mandateRow || !proposal) throw new Error("mandate or proposal missing");
  const mandate = mandateRow.typedData as Mandate;
  const body = proposal.body as { market: MarketContext; uiSpec: UISpec; proposal: { userLabel: string } };

  const config = loadEnsConfig();
  const created = await createTask(config, {
    userLabel: body.proposal.userLabel, taskId, mandateHash: mandateDigest(mandate),
    owner: mandate.owner, agent: mandate.agent,
    chart: chartPayload(body.market, body.uiSpec), ui: JSON.stringify(body.uiSpec),
  });
  await db.insert(tables.receipts).values([
    { taskId, kind: "ens_tx", txId: created.recordsTxId, network: "eip155:11155111", payload: { step: "records" } },
    { taskId, kind: "ens_tx", txId: created.txId, network: "eip155:11155111", payload: { step: "delegate" } },
  ]);
  await db.update(tables.tasks).set({ status: "active" }).where(eq(tables.tasks.id, taskId));
  await db.insert(tables.outbox).values({ channel: "web", target: task.userWallet, payload: { type: "task.active", taskId, ensName: created.name } });
};
```
Note for Task 2 alignment: `createTask` now writes `status = draft` at creation; make it accept an optional `status` param and pass `"active"` here (records + delegation happen in one publish, so the name goes straight to `active`).

- [ ] **Step 6: Run runtime + web tests, typecheck — PASS. Commit**

```bash
git add apps/web packages/runtime packages/ens && git commit -m "feat(mandate): authorization bound to the stored proposal; ENS publication as a durable job"
```

---

### Task 9: Chat UI — polling and timed stages

**Files:**
- Modify: `apps/web/app/chat-section.tsx`
- Create: `apps/web/app/use-run.ts`

**Interfaces:**
- `useRun(runId | null) → { status, events, stage, error }` polling `GET /api/runs/:id/events?after=<lastSeq>` every 1 s until `status ∈ {done, failed}`.

- [ ] **Step 1: Write the hook**

`apps/web/app/use-run.ts`:
```ts
"use client";
import { useEffect, useRef, useState } from "react";

export interface RunEvent { seq: number; stage: string; type: string; payload: unknown }
export function useRun(runId: string | null) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [status, setStatus] = useState<"queued" | "running" | "done" | "failed" | null>(null);
  const last = useRef(0);
  useEffect(() => {
    if (!runId) return;
    let stop = false;
    const poll = async () => {
      const res = await fetch(`/api/runs/${runId}/events?after=${last.current}`);
      if (!res.ok) { setStatus("failed"); return; }
      const body = (await res.json()) as { status: typeof status; events: RunEvent[] };
      if (body.events.length) { last.current = body.events.at(-1)!.seq; setEvents((e) => [...e, ...body.events]); }
      setStatus(body.status);
      if (!stop && body.status !== "done" && body.status !== "failed") setTimeout(poll, 1000);
    };
    void poll();
    return () => { stop = true; };
  }, [runId]);
  const stage = events.at(-1)?.stage ?? "queued";
  const error = events.find((e) => e.type === "error")?.payload as { error?: string } | undefined;
  return { status, events, stage, error: error?.error ?? null };
}
```

- [ ] **Step 2: Wire the chat section**

In `chat-section.tsx`: on send, generate `clientRequestId = crypto.randomUUID()` once per message (store it with the pending message so a retry reuses it), POST `/api/chat`, keep `runId` in state, render `useRun(runId)`: a stage row (`inspecting wallet → fetching context → paying analysis → generating UI → awaiting signature`) with elapsed seconds, text deltas appended as they arrive, and when `status === "done"` read `proposalId`, `ensName`, `receipts` from the `result` event payload and pass `proposalId` to `MandateRenderer`/`publishGuard` (the mandate POST now sends `proposalId` instead of `market`/`uiSpec`). Load the UISpec for rendering from a new `GET /api/proposals/:id` (owner-gated, returns `body.uiSpec` + `body.market`) — add it in the same task (12 lines, same shape as the events route).

- [ ] **Step 3: Manual verification**

Run `pnpm dev`; connect; send a prompt; observe stages advancing; **reload the page mid-run** — the stage row resumes from the events endpoint (the client stores `runId` in `sessionStorage` keyed by conversation). Sign; observe `awaiting_authorization → active` after the worker publishes.

- [ ] **Step 4: Typecheck, lint, commit**

```bash
git add apps/web && git commit -m "feat(web): chat polls durable run events with timed stages; mandate submits proposalId"
```

---

### Task 10: Gate verification

**Files:**
- Create: `scripts/verify-durability.ts`; root script `verify:durability`

- [ ] **Step 1: Write the script**

Using a throwaway viem account like `scripts/verify-x402.ts` does: challenge → verify → POST `/api/chat` twice with the same `clientRequestId` → assert both return the same `runId` and the second has `created: false` → poll events until `done` → assert exactly one `proposals` row for that run (query Neon directly with `createDb()`) → print `verify:durability OK`. Then a second scenario: enqueue a `chat.run` job directly, set its `leased_until` to 1 s ago with `leased_by = 'dead-worker'`, start the worker for one `tick` via `@custodia/runtime`, assert the job was re-leased and completed.

- [ ] **Step 2: Run against local dev**

Run: `pnpm dev` in one terminal, `pnpm verify:durability` in another. Expected: `verify:durability OK`.

- [ ] **Step 3: Commit and record the gate**

```bash
git add scripts/verify-durability.ts package.json && git commit -m "test(stage-1): durability gate — idempotent runs, stealable leases"
```
Append to `PROGRESS.md`: "Stage 1 gate passed on <date> — `pnpm verify:durability`."

---

## Self-review notes

- Spec §4 "return a run ID / stream progress with polling fallback" → Tasks 7, 9. SSE deferred (polling is the fallback the spec allows).
- Spec §4 "consumed authentication challenges" → Task 3. "immutable proposal versions" → Task 4/5. "task runs, jobs, leases" → Tasks 4–6. "notification outbox" → table in Task 1, first writer in Task 8; the drain (`notify` handler) belongs to Stage 6.
- Spec §3 task states → Task 2; `expired` is set by a Stage 5 sweep, not here.
- "Never accept browser-supplied market data or UI" → Task 8 (`.strict()` schema + stored proposal).
- Type consistency: `AnyDb` defined in `runs.ts`, reused by jobs/proposals/handlers; `Job` from `jobs.ts`; `RunStage` union used by handlers and the UI stage row; `createTask` gains optional `status` (Task 8 note) — update its signature in `packages/ens/src/ops.ts` when doing Task 2.
