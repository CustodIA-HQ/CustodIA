import { randomUUID } from "node:crypto";
import { tables } from "@custodia/db";
import { eq } from "drizzle-orm";
import { keccak256, toHex } from "viem";
import type { AnyDb } from "./runs.js";

/** Canonical JSON: sorted keys, no whitespace — the same bytes for the same content. */
export const canonicalJson = (value: unknown): string =>
  JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v as Record<string, unknown>)
            .sort()
            .map((k) => [k, (v as Record<string, unknown>)[k]]),
        )
      : v,
  );

export const proposalHash = (body: unknown): `0x${string}` => keccak256(toHex(canonicalJson(body)));

/** Proposals are immutable: (taskId, version) is unique, so re-storing throws. */
export async function storeProposal(
  db: AnyDb,
  params: { runId: string; taskId: string; ownerWallet: string; body: unknown; version?: number },
): Promise<{ proposalId: string; hash: `0x${string}` }> {
  const id = randomUUID();
  const hash = proposalHash(params.body);
  await db.insert(tables.proposals).values({
    id,
    runId: params.runId,
    taskId: params.taskId,
    ownerWallet: params.ownerWallet,
    version: params.version ?? 1,
    hash,
    body: params.body as object,
  });
  return { proposalId: id, hash };
}

export const loadProposal = async (db: AnyDb, proposalId: string) =>
  (
    await db.select().from(tables.proposals).where(eq(tables.proposals.id, proposalId)).limit(1)
  )[0] ?? null;
