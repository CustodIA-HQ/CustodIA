import "../../../../env";

import { createDb } from "@custodia/db";
import { loadEnsConfig, revokeAgent } from "@custodia/ens";
import { loadTask, transitionTask } from "@custodia/runtime";
import { NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { z } from "zod";
import { getAgentAddress } from "../../../identity";
import { sessionFrom } from "../../../session";

const BodySchema = z.object({
  message: z.string().min(1),
  signature: z.string().regex(/^0x[0-9a-f]+$/i),
});

export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = sessionFrom(request);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "A revoke signature is required." }, { status: 400 });
  }
  const expected = `CustodIA revoke task ${id}`;
  if (parsed.data.message.trim() !== expected) {
    return NextResponse.json(
      { error: "Revoke message does not match this task." },
      { status: 400 },
    );
  }
  const valid = await verifyMessage({
    address: session.address,
    message: parsed.data.message,
    signature: parsed.data.signature as `0x${string}`,
  });
  if (!valid)
    return NextResponse.json({ error: "Revoke signature was rejected." }, { status: 401 });

  const db = createDb();
  const task = await loadTask(db as never, id);
  if (!task || task.userWallet.toLowerCase() !== session.address.toLowerCase()) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  await transitionTask(db as never, id, "revoked", "owner");
  try {
    await revokeAgent(loadEnsConfig(), task.ensName, getAgentAddress());
  } catch (error) {
    console.error(
      `[revoke] ENS role revoke deferred: ${error instanceof Error ? error.message : error}`,
    );
  }
  return NextResponse.json({ ok: true, status: "revoked", ensName: task.ensName });
}
