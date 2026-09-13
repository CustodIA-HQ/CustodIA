import "../../../env";

import { createDb } from "@custodia/db";
import { getParentName, parseClaimLabel } from "@custodia/ens";
import { claimUserLabel, enqueueJob, notifyOwner, readClaimToken } from "@custodia/runtime";
import { NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { z } from "zod";
import { claimMessage } from "../../../ens-claim";

const BodySchema = z
  .object({
    token: z.string().min(1).max(512),
    address: z.string().min(1),
    signature: z
      .string()
      .regex(/^0x[0-9a-f]+$/i)
      .optional(),
  })
  .strict();

export const dynamic = "force-dynamic";

/**
 * POST /api/ens/claim-chat { token, address, signature? } — the chat-started
 * claim. The token (from the bot) fixes wallet and label; without a
 * signature it returns the message to sign; with one it verifies, reserves
 * the label and queues the on-chain attach, then confirms in the chat.
 */
export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid claim request" }, { status: 400 });
  const ticket = readClaimToken(parsed.data.token);
  if (!ticket) {
    return NextResponse.json(
      { error: "This claim link is invalid or expired. Ask the bot again." },
      { status: 401 },
    );
  }
  if (ticket.wallet.toLowerCase() !== parsed.data.address.toLowerCase()) {
    return NextResponse.json(
      { error: `This link is for wallet ${ticket.wallet.slice(0, 8)}…; connect that wallet.` },
      { status: 403 },
    );
  }
  const claim = parseClaimLabel(ticket.label, getParentName());
  if (!claim.ok) return NextResponse.json({ error: claim.error }, { status: 400 });
  const message = claimMessage(ticket.wallet, claim.name);
  if (!parsed.data.signature) return NextResponse.json({ message, name: claim.name });

  const valid = await verifyMessage({
    address: ticket.wallet,
    message,
    signature: parsed.data.signature as `0x${string}`,
  }).catch(() => false);
  if (!valid)
    return NextResponse.json(
      { error: "The signature does not match this wallet" },
      { status: 401 },
    );

  const db = createDb() as never;
  try {
    await claimUserLabel(db, ticket.wallet, claim.label);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not reserve that name." },
      { status: 409 },
    );
  }
  await enqueueJob(db, {
    kind: "ens.attach",
    payload: { wallet: ticket.wallet, label: claim.label },
    dedupeKey: `ens.attach:${ticket.wallet.toLowerCase()}:${claim.label}`,
  });
  await notifyOwner(
    db,
    ticket.wallet,
    `${claim.name} is reserved for you. Attaching it on Sepolia ENS now — I'll confirm with the transaction.`,
  );
  return NextResponse.json({ ok: true, name: claim.name });
}
