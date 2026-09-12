import {
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Spent-to-date is computed from `receipts` (sum of rows) — never a counter
 * column. A counter drifts the moment a retry, refund or reversal lands.
 */

export const users = pgTable("users", {
  wallet: text("wallet").primaryKey(),
  ensLabel: text("ens_label"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(), // 8 hex chars — the wildcard subname label
  userWallet: text("user_wallet").notNull(),
  ensName: text("ens_name").notNull(),
  template: text("template"),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const mandates = pgTable(
  "mandates",
  {
    id: serial("id").primaryKey(),
    taskId: text("task_id").notNull(),
    version: integer("version").notNull(),
    typedData: jsonb("typed_data").notNull(), // the full mandate JSON
    signature: text("signature"), // EIP-712 signature from the owner
    hash: text("hash").notNull(), // the digest written to ENS
    signedAt: timestamp("signed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("mandates_task_version_idx").on(table.taskId, table.version),
    index("mandates_task_id_idx").on(table.taskId),
  ],
);

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  taskId: text("task_id"),
  channel: text("channel").notNull().default("web"),
  role: text("role").notNull(),
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const receipts = pgTable(
  "receipts",
  {
    id: serial("id").primaryKey(),
    taskId: text("task_id"),
    kind: text("kind").notNull(), // x402 | ens_tx
    txId: text("tx_id").notNull(),
    amount: text("amount"),
    network: text("network").notNull(),
    payload: jsonb("payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("receipts_task_id_idx").on(table.taskId)],
);

export const marketCache = pgTable("market_cache", {
  key: text("key").primaryKey(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  ttlS: integer("ttl_s").notNull(),
});

export const cursors = pgTable("cursors", {
  id: text("id").primaryKey(), // e.g. "watcher"
  lastProcessedId: text("last_processed_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

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
    // inspecting_wallet | fetching_context | paying_analysis | generating_ui | awaiting_signature | publishing | done | failed
    stage: text("stage").notNull(),
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
  // One live job per dedupe key is a partial unique index, added by hand in the
  // migration SQL (drizzle-kit cannot express it here).
  (t) => [index("jobs_status_run_after_idx").on(t.status, t.runAfter)],
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
