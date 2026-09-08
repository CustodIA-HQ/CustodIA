import { integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
  status: text("status").notNull().default("active"),
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
  (table) => [uniqueIndex("mandates_task_version_idx").on(table.taskId, table.version)],
);

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  taskId: text("task_id"),
  channel: text("channel").notNull().default("web"),
  role: text("role").notNull(),
  content: jsonb("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const receipts = pgTable("receipts", {
  id: serial("id").primaryKey(),
  taskId: text("task_id"),
  kind: text("kind").notNull(), // x402 | ens_tx
  txId: text("tx_id").notNull(),
  amount: text("amount"),
  network: text("network").notNull(),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const marketCache = pgTable("market_cache", {
  key: text("key").primaryKey(),
  payload: jsonb("payload").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  ttlS: integer("ttl_s").notNull(),
});
