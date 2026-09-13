import "../../../../env";

import { createDb, tables } from "@custodia/db";
import { resolveProposal } from "@custodia/runtime";
import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionFrom } from "../../../session";

const BodySchema = z.object({ answer: z.enum(["yes", "no"]) }).strict();

export const dynamic = "force-dynamic";

/** POST /api/inbox/proposals/:id { answer } — YES/NO on an agent proposal from the web inbox. */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = sessionFrom(request);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "answer must be yes or no" }, { status: 400 });
  const db = createDb();
  const [row] = await db
    .select({ action: tables.actions, owner: tables.tasks.userWallet })
    .from(tables.actions)
    .innerJoin(tables.tasks, eq(tables.actions.taskId, tables.tasks.id))
    .where(
      and(
        eq(tables.actions.id, id),
        sql`lower(${tables.tasks.userWallet}) = ${session.address.toLowerCase()}`,
      ),
    )
    .limit(1);
  if (!row) return NextResponse.json({ error: "Proposal not found." }, { status: 404 });
  if (row.action.status !== "proposed") {
    return NextResponse.json(
      { error: `This proposal is already ${row.action.status}.` },
      { status: 409 },
    );
  }
  await resolveProposal(db as never, id, parsed.data.answer, null);
  return NextResponse.json({
    ok: true,
    status: parsed.data.answer === "yes" ? "previewed" : "declined",
  });
}
