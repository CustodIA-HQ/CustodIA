import "../../../env";

import { createDb } from "@custodia/db";
import { loadLatestProposal, loadRun, loadTask, readTaskLinkToken } from "@custodia/runtime";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgentAddress } from "../../identity";
import { createSessionToken, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS } from "../session";

const BodySchema = z.object({ token: z.string().min(1).max(512) }).strict();

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/link { token } — turns the bot's signed task ticket into a
 * web session for the wallet that owns the task, bound to the chat run's
 * conversation so the mandate route accepts the signature. The chat already
 * proved the wallet (verification signature); this only carries that proof
 * to the browser. 24 h ticket, 4 h session.
 */
export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  const ticket = readTaskLinkToken(parsed.data.token);
  if (!ticket)
    return NextResponse.json(
      { error: "This link has expired. Ask the bot for the task again." },
      { status: 401 },
    );
  const db = createDb() as never;
  const task = await loadTask(db, ticket.taskId);
  if (!task || task.userWallet.toLowerCase() !== ticket.wallet.toLowerCase()) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  const proposal = await loadLatestProposal(db, ticket.taskId);
  const run = proposal ? await loadRun(db, proposal.runId) : null;
  const conversationId = run?.conversationId ?? `task:${ticket.taskId}`;
  const now = Date.now();
  const session = {
    address: task.userWallet as `0x${string}`,
    agent: getAgentAddress(),
    conversationId,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_SECONDS * 1_000,
  };
  const response = NextResponse.json({ ok: true, address: session.address, conversationId });
  response.cookies.set(SESSION_COOKIE_NAME, createSessionToken(session), {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
