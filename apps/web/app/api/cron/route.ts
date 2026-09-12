import { NextResponse } from "next/server";
import { createDb } from "@custodia/db";
import { enqueueJob } from "@custodia/runtime";

/** Enqueue monitor + outbox drain. Authorized by CRON_SECRET. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = createDb();
  const monitor = await enqueueJob(db as never, {
    kind: "monitor.active",
    payload: {},
    dedupeKey: "monitor.active",
  });
  const notify = await enqueueJob(db as never, {
    kind: "notify.drain",
    payload: {},
    dedupeKey: "notify.drain",
  });
  return NextResponse.json({ ok: true, monitor, notify, simulated: true });
}
