import { NextResponse } from "next/server";

/** Reserved for a durable watcher; never advance cursors for placeholder work. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ error: "Watcher processing is not implemented" }, { status: 501 });
}
