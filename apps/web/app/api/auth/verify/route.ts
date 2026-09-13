import "../../../env";

import { createDb, PostgresChallengeStore } from "@custodia/db";
import { getParentName, makeOwnerName } from "@custodia/ens";
import { getStoredUserLabel } from "@custodia/runtime";
import { NotImplementedError } from "@custodia/schema";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAgentAddress } from "../../identity";
import { AuthError, SESSION_COOKIE_NAME, SESSION_TTL_SECONDS, verifyChallenge } from "../session";

let challengeStore: PostgresChallengeStore | undefined;
const getChallengeStore = (): PostgresChallengeStore => {
  challengeStore ??= new PostgresChallengeStore(createDb() as never);
  return challengeStore;
};

const VerifyRequestSchema = z
  .object({
    address: z.string().min(1),
    conversationId: z.string().uuid(),
    message: z.string().min(1),
    signature: z.string().regex(/^0x[0-9a-f]+$/i, "expected a hex wallet signature"),
  })
  .strict();

export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = VerifyRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Invalid conversation signature: ${parsed.error.message}` },
      { status: 400 },
    );
  }

  try {
    const { session, token } = await verifyChallenge({
      ...parsed.data,
      agent: getAgentAddress(),
      store: getChallengeStore(),
    });
    let ensName: string | null = null;
    try {
      const label = await getStoredUserLabel(createDb() as never, session.address);
      if (label) ensName = makeOwnerName(label, getParentName());
    } catch (error) {
      console.error(
        `[auth] ENS lookup skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const response = NextResponse.json({
      authenticated: true,
      address: session.address,
      conversationId: session.conversationId,
      expiresAt: session.expiresAt,
      ensName,
      needsEnsClaim: !ensName,
    });
    response.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      maxAge: SESSION_TTL_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not verify the signature";
    if (error instanceof AuthError) return NextResponse.json({ error: message }, { status: 401 });
    if (error instanceof NotImplementedError) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    // Anything else is the challenge store (database) failing, not a bad request.
    console.error(`[auth] verify failed: ${message}`);
    return NextResponse.json(
      { error: "Sign-in is temporarily unavailable. Try again in a moment." },
      { status: 503 },
    );
  }
}
