import "../../../env";

import { createDb } from "@custodia/db";
import { loadProposal } from "@custodia/runtime";
import { NextResponse } from "next/server";
import { readSessionToken, SESSION_COOKIE_NAME } from "../../auth/session";

export const dynamic = "force-dynamic";

const cookieValue = (header: string | null): string | undefined =>
  header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);

/** GET /api/proposals/:id — the stored proposal (market, uiSpec, proposal), owner-gated. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = readSessionToken(cookieValue(request.headers.get("cookie")));
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const proposal = await loadProposal(createDb(), id);
  if (!proposal || proposal.ownerWallet.toLowerCase() !== session.address.toLowerCase()) {
    return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  }
  return NextResponse.json({
    id: proposal.id,
    hash: proposal.hash,
    taskId: proposal.taskId,
    ...(proposal.body as object),
  });
}
