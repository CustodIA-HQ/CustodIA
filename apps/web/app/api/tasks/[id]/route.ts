import "../../../env";

import { createDb, tables } from "@custodia/db";
import { loadLatestMandate, loadLatestProposal, loadTask } from "@custodia/runtime";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { sessionFrom } from "../../session";

export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = sessionFrom(request);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const db = createDb();
  const task = await loadTask(db as never, id);
  if (!task || task.userWallet.toLowerCase() !== session.address.toLowerCase()) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  const mandateRow = await loadLatestMandate(db as never, id);
  const proposal = await loadLatestProposal(db as never, id);
  const receipts = await db.select().from(tables.receipts).where(eq(tables.receipts.taskId, id));
  return NextResponse.json({
    task: {
      id: task.id,
      ensName: task.ensName,
      status: task.status,
      template: task.template,
    },
    mandate: mandateRow?.typedData ?? null,
    proposal: proposal ? { id: proposal.id, hash: proposal.hash, body: proposal.body } : null,
    receipts,
    simulated: true,
    notice:
      "Real market data · simulated execution. Paper ETH/USDC balances are separate from your wallet. No on-chain swap is submitted.",
  });
}
