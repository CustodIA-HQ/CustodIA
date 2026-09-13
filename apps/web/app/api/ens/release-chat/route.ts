import "../../../env";

import { createDb } from "@custodia/db";
import { getParentName } from "@custodia/ens";
import { enqueueJob, getStoredUserLabel, readClaimToken } from "@custodia/runtime";
import { NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { z } from "zod";
import { releaseMessage } from "../../../ens-claim";

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

/** POST /api/ens/release-chat { token, address, signature? } — the chat-started release. */
export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid release request" }, { status: 400 });
  const ticket = readClaimToken(parsed.data.token);
  if (!ticket)
    return NextResponse.json(
      { error: "This link is invalid or expired. Ask the bot again." },
      { status: 401 },
    );
  if (ticket.wallet.toLowerCase() !== parsed.data.address.toLowerCase()) {
    return NextResponse.json(
      { error: "Connect the wallet this link was issued for." },
      { status: 403 },
    );
  }
  const db = createDb() as never;
  const current = await getStoredUserLabel(db, ticket.wallet);
  if (current !== ticket.label) {
    return NextResponse.json(
      { error: "That name is no longer attached to this wallet." },
      { status: 409 },
    );
  }
  const name = `${ticket.label}.${getParentName()}`;
  const message = releaseMessage(ticket.wallet, name);
  if (!parsed.data.signature) return NextResponse.json({ message, name });
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
  await enqueueJob(db, {
    kind: "ens.release",
    payload: { wallet: ticket.wallet, label: ticket.label },
    dedupeKey: `ens.release:${ticket.wallet.toLowerCase()}:${ticket.label}`,
  });
  return NextResponse.json({ ok: true, name });
}
