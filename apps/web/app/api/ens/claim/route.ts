import "../../../env";

import { createDb } from "@custodia/db";
import { getParentName, parseClaimLabel } from "@custodia/ens";
import { claimUserLabel, enqueueJob } from "@custodia/runtime";
import { NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { z } from "zod";
import { claimMessage } from "../../../ens-claim";
import { sessionFrom } from "../../session";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  label: z.string().min(1),
  message: z.string().min(1),
  signature: z.string().regex(/^0x[0-9a-f]+$/i),
});

export async function POST(request: Request) {
  const session = sessionFrom(request);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const parsed = BodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Label and a wallet signature are required." }, { status: 400 });
  }
  const claim = parseClaimLabel(parsed.data.label, getParentName());
  if (!claim.ok) return NextResponse.json({ error: claim.error }, { status: 400 });

  const expected = claimMessage(session.address, claim.name);
  if (parsed.data.message.trim() !== expected) {
    return NextResponse.json({ error: "Signed message does not match this ENS claim." }, { status: 400 });
  }
  const valid = await verifyMessage({
    address: session.address,
    message: parsed.data.message,
    signature: parsed.data.signature as `0x${string}`,
  });
  if (!valid) return NextResponse.json({ error: "ENS claim signature was rejected." }, { status: 401 });

  try {
    await claimUserLabel(createDb() as never, session.address, claim.label);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not reserve that name." },
      { status: 409 },
    );
  }

  const { jobId } = await enqueueJob(createDb() as never, {
    kind: "ens.attach",
    payload: { wallet: session.address, label: claim.label },
    dedupeKey: `ens.attach:${session.address.toLowerCase()}:${claim.label}`,
  });

  return NextResponse.json(
    {
      ok: true,
      ensLabel: claim.label,
      ensName: claim.name,
      jobId,
      attached: false,
    },
    { status: 202 },
  );
}
