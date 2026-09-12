import "../../env";

import { createDb } from "@custodia/db";
import { getParentName, loadEnsConfig, makeOwnerName, resolveOwner } from "@custodia/ens";
import { getStoredUserLabel } from "@custodia/runtime";
import { NextResponse } from "next/server";
import { sessionFrom } from "../session";

export const dynamic = "force-dynamic";

/** GET /api/identity — owner ENS name for the signed-in wallet. */
export async function GET(request: Request) {
  const session = sessionFrom(request);
  if (!session) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const label = await getStoredUserLabel(createDb() as never, session.address);
  const ensName = label ? makeOwnerName(label, getParentName()) : null;
  let attached = false;
  if (ensName) {
    try {
      const records = await resolveOwner(loadEnsConfig(), ensName);
      attached = records["xyz.custodia.owner"]?.toLowerCase() === session.address.toLowerCase();
    } catch {
      attached = false;
    }
  }
  return NextResponse.json({
    address: session.address,
    ensLabel: label,
    ensName,
    attached,
    needsEnsClaim: !label,
    parentName: getParentName(),
  });
}
