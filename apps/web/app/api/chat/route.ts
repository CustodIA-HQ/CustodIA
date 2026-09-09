import { NotImplementedError } from "@custodia/schema";
import { NextResponse } from "next/server";

/**
 * POST /api/chat — runs the agent and streams text + tool events over SSE.
 * Implementation lands in step 7; until OPENAI_API_KEY is configured the
 * missing prerequisite is reported loudly instead of a canned response.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: new NotImplementedError("OPENAI_API_KEY (step 6/7 — the SSE chat routes)").message,
    },
    { status: 501 },
  );
}
