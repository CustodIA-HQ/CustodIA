import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "./schema.js";

describe("durable schema", () => {
  it("has the stage-1 tables with their key columns", () => {
    expect(Object.keys(getTableColumns(schema.runs))).toEqual(
      expect.arrayContaining([
        "id",
        "conversationId",
        "ownerWallet",
        "kind",
        "status",
        "clientRequestId",
        "input",
        "output",
        "createdAt",
        "finishedAt",
      ]),
    );
    expect(Object.keys(getTableColumns(schema.jobs))).toEqual(
      expect.arrayContaining([
        "id",
        "kind",
        "payload",
        "dedupeKey",
        "status",
        "attempts",
        "leasedBy",
        "leasedUntil",
        "runAfter",
        "lastError",
      ]),
    );
    expect(Object.keys(getTableColumns(schema.proposals))).toEqual(
      expect.arrayContaining(["id", "runId", "taskId", "version", "hash", "body", "createdAt"]),
    );
    expect(Object.keys(getTableColumns(schema.authChallenges))).toEqual(
      expect.arrayContaining(["nonce", "conversationId", "address", "consumedAt"]),
    );
    expect(Object.keys(getTableColumns(schema.outbox))).toEqual(
      expect.arrayContaining([
        "id",
        "channel",
        "target",
        "payload",
        "status",
        "attempts",
        "createdAt",
        "sentAt",
      ]),
    );
    expect(schema.tasks.status.default).toBe("draft");
  });
});
