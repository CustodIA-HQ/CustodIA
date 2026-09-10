import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgentAddress, normalizeAddress } from "../../identity";
import { createChallenge } from "../session";

const ChallengeRequestSchema = z
  .object({
    address: z.string().min(1),
    conversationId: z.string().uuid(),
  })
  .strict();

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = ChallengeRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Invalid conversation challenge: ${parsed.error.message}` },
      { status: 400 },
    );
  }

  try {
    const challenge = createChallenge({
      address: normalizeAddress(parsed.data.address),
      agent: getAgentAddress(),
      conversationId: parsed.data.conversationId,
    });
    return NextResponse.json(challenge);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create a challenge";
    return NextResponse.json(
      { error: message },
      { status: message.startsWith("Not implemented:") ? 503 : 400 },
    );
  }
}
