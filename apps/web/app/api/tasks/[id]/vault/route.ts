import "../../../../env";

import { createDb, tables } from "@custodia/db";
import { loadLatestMandate, loadTask } from "@custodia/runtime";
import { type Mandate, mandateDigest } from "@custodia/schema";
import { readVault } from "@custodia/vault";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress } from "viem";
import { sepolia } from "viem/chains";
import { z } from "zod";
import { sessionFrom } from "../../../session";

const BodySchema = z.object({ vault: z.string() }).strict();

export const dynamic = "force-dynamic";

/**
 * POST /api/tasks/:id/vault { vault } — record the TaskVault the owner just
 * deployed. Verified on-chain before anything is stored: the vault's owner is
 * the signed-in wallet, its installed mandate hash is this task's latest
 * signed mandate, and its signers are ours.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = sessionFrom(request);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || !isAddress(parsed.data.vault)) {
    return NextResponse.json({ error: "A vault address is required." }, { status: 400 });
  }
  const db = createDb();
  const task = await loadTask(db as never, id);
  if (!task || task.userWallet.toLowerCase() !== session.address.toLowerCase()) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  const mandateRow = await loadLatestMandate(db as never, id);
  if (!mandateRow) return NextResponse.json({ error: "Sign the mandate first." }, { status: 409 });
  const expectedHash = mandateDigest(mandateRow.typedData as Mandate);

  const client = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL),
  });
  let vault: Awaited<ReturnType<typeof readVault>>;
  try {
    vault = await readVault(client, parsed.data.vault);
  } catch {
    return NextResponse.json({ error: "No TaskVault at that address." }, { status: 400 });
  }
  if (vault.owner.toLowerCase() !== session.address.toLowerCase()) {
    return NextResponse.json({ error: "That vault is owned by another wallet." }, { status: 403 });
  }
  if (vault.mandateHash.toLowerCase() !== expectedHash.toLowerCase()) {
    return NextResponse.json(
      { error: "The vault's mandate does not match this task's signed mandate." },
      { status: 409 },
    );
  }
  await db
    .update(tables.tasks)
    .set({ vault: vault.address, vaultMandateHash: vault.mandateHash })
    .where(eq(tables.tasks.id, id));
  return NextResponse.json({ ok: true, vault: vault.address });
}
