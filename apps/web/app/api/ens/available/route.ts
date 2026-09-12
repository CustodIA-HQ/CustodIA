import "../../../env";

import { createDb } from "@custodia/db";
import { getParentName, loadEnsConfig, lookupOwnerRecord, parseClaimLabel } from "@custodia/ens";
import { isLabelTaken } from "@custodia/runtime";
import { NextResponse } from "next/server";
import { sessionFrom } from "../../session";

export const dynamic = "force-dynamic";

/** GET /api/ens/available?label=alice — check a CustodIA ENS label. */
export async function GET(request: Request) {
  const session = sessionFrom(request);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const labelParam = new URL(request.url).searchParams.get("label") ?? "";
  const parsed = parseClaimLabel(labelParam, getParentName());
  if (!parsed.ok) {
    return NextResponse.json({ available: false, error: parsed.error, label: null, name: null });
  }
  const taken = await isLabelTaken(createDb() as never, parsed.label, session.address);
  if (taken) {
    return NextResponse.json({
      available: false,
      error: `${parsed.name} is already claimed by another wallet.`,
      label: parsed.label,
      name: parsed.name,
      yours: false,
    });
  }
  let onchain: string | null = null;
  try {
    onchain = await lookupOwnerRecord(loadEnsConfig(), parsed.name);
  } catch {
    onchain = null;
  }
  if (onchain && onchain.toLowerCase() !== session.address.toLowerCase()) {
    return NextResponse.json({
      available: false,
      error: `${parsed.name} is already attached on Sepolia.`,
      label: parsed.label,
      name: parsed.name,
      yours: false,
    });
  }
  return NextResponse.json({
    available: true,
    label: parsed.label,
    name: parsed.name,
    yours: Boolean(onchain),
    error: null,
  });
}
