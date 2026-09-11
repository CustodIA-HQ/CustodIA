import "../../../../env";

import { createDb } from "@custodia/db";
import { listEvents, loadRun } from "@custodia/runtime";
import { NextResponse } from "next/server";
import { readSessionToken, SESSION_COOKIE_NAME } from "../../../auth/session";

export const dynamic = "force-dynamic";

const cookieValue = (header: string | null): string | undefined =>
  header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);

/** GET /api/runs/:id/events?after=<seq> — polling view of a run, owner-gated. */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = readSessionToken(cookieValue(request.headers.get("cookie")));
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
