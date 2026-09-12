import "../../../../env";

import { createDb } from "@custodia/db";
import { listEvents, loadRun } from "@custodia/runtime";
import { readSessionToken, SESSION_COOKIE_NAME } from "../../../auth/session";

export const dynamic = "force-dynamic";

const POLL_INTERVAL_MS = 800;
const MAX_STREAM_MS = 45_000; // Vercel function hard limit is 60 s

const cookieValue = (header: string | null): string | undefined =>
  header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`))
    ?.slice(SESSION_COOKIE_NAME.length + 1);

/**
 * GET /api/runs/:id/events — Server-Sent Events stream.
 *
 * Emits `data: <json>\n\n` for each new run_event row as soon as it lands,
 * and a final `data: {"done":true}\n\n` when the run reaches a terminal state.
 * Falls back gracefully: if the client disconnects the stream is abandoned.
 *
 * The `after` query-param (seq cursor) lets a reconnecting client resume
 * without replaying already-seen events.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = readSessionToken(cookieValue(request.headers.get("cookie")));
  if (!session) {
    return new Response(JSON.stringify({ error: "Sign in first." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = createDb();
  const run = await loadRun(db, id);
  if (!run || run.ownerWallet.toLowerCase() !== session.address.toLowerCase()) {
    return new Response(JSON.stringify({ error: "Run not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  let cursor = Number(new URL(request.url).searchParams.get("after") ?? "0") || 0;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const deadline = Date.now() + MAX_STREAM_MS;

      const send = (payload: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      // Flush any events that already exist (client may have reconnected).
      const initial = await listEvents(db, id, cursor);
      for (const ev of initial) {
        send(ev);
        cursor = Math.max(cursor, ev.seq);
      }

      // Poll until the run is terminal or we hit the deadline.
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

        const current = await loadRun(db, id);
        const events = await listEvents(db, id, cursor);
        for (const ev of events) {
          send(ev);
          cursor = Math.max(cursor, ev.seq);
        }

        if (current?.status === "done" || current?.status === "failed") {
          // Send a sentinel so clients can close without another poll.
          send({ done: true, status: current.status, runId: id });
          break;
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
