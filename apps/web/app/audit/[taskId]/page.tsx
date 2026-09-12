import { createDb, tables } from "@custodia/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

interface TimelineEvent {
  id: string;
  timestamp: Date;
  type: "event" | "proposal" | "receipt";
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

export default async function AuditPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;

  if (!process.env.DATABASE_URL) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-400 font-mono text-sm">
        [ERR] DATABASE_URL not configured
      </div>
    );
  }

  const db = createDb();

  const [proposal] = await db
    .select()
    .from(tables.proposals)
    .where(eq(tables.proposals.taskId, taskId))
    .limit(1);

  if (!proposal) {
    notFound();
  }

  const [dbEvents, dbReceipts] = await Promise.all([
    db.select().from(tables.runEvents).where(eq(tables.runEvents.runId, proposal.runId)),
    db.select().from(tables.receipts).where(eq(tables.receipts.taskId, taskId)),
  ]);

  const timeline: TimelineEvent[] = [
    ...dbEvents.map((e) => ({
      id: `evt-${e.id}`,
      timestamp: e.createdAt,
      type: "event" as const,
      title: `Event: ${e.stage} [${e.type}]`,
      data: e,
    })),
    {
      id: `prop-${proposal.id}`,
      timestamp: proposal.createdAt,
      type: "proposal" as const,
      title: `Proposal (v${proposal.version})`,
      data: proposal,
    },
    ...dbReceipts.map((r) => ({
      id: `rec-${r.id}`,
      timestamp: r.createdAt,
      type: "receipt" as const,
      title: r.kind === "x402" ? "x402 Payment" : "ENS Transaction",
      data: r,
    })),
  ].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300 font-mono p-6 sm:p-10">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="border-b border-zinc-800 pb-6">
          <h1 className="text-2xl font-semibold text-zinc-100">Audit Log: {taskId}</h1>
          <div className="mt-2 text-sm text-zinc-500 flex flex-col sm:flex-row sm:gap-6">
            <span>
              Owner: <span className="text-zinc-300">{proposal.ownerWallet}</span>
            </span>
            <span>
              Version: <span className="text-zinc-300">{proposal.version}</span>
            </span>
            <span>Created: {proposal.createdAt.toLocaleString()}</span>
          </div>
        </header>

        <div className="space-y-6">
          {timeline.length === 0 ? (
            <div className="text-zinc-600 text-sm">No events found for this task.</div>
          ) : (
            timeline.map((event) => (
              <div key={event.id} className="relative pl-6 sm:pl-8 border-l border-zinc-800">
                <div className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full bg-zinc-800 border-2 border-zinc-950" />

                <div className="flex flex-col sm:flex-row sm:items-baseline gap-2 mb-2">
                  <span className="text-sm font-medium text-zinc-100">{event.title}</span>
                  <span className="text-xs text-zinc-500">{event.timestamp.toLocaleString()}</span>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-md p-4 text-sm overflow-x-auto">
                  {event.type === "event" && (
                    <div>
                      <div className="text-zinc-400 mb-2">
                        Stage: {event.data.stage} | Type: {event.data.type}
                      </div>
                      <pre className="text-xs text-zinc-300 whitespace-pre-wrap font-mono">
                        {JSON.stringify(event.data.payload, null, 2)}
                      </pre>
                    </div>
                  )}

                  {event.type === "proposal" && (
                    <div className="space-y-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-zinc-500 text-xs uppercase tracking-wider">Hash</span>
                        <span className="text-amber-500 font-semibold break-all">
                          {event.data.hash}
                        </span>
                      </div>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
                          View Proposal Body
                        </summary>
                        <pre className="mt-2 text-xs text-zinc-400 whitespace-pre-wrap">
                          {JSON.stringify(event.data.body, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}

                  {event.type === "receipt" && (
                    <div className="space-y-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-zinc-500 text-xs uppercase tracking-wider">
                          Tx ID
                        </span>
                        <span className="text-emerald-400 font-semibold break-all">
                          {event.data.txId}
                        </span>
                      </div>
                      {event.data.amount && (
                        <div className="flex gap-2 items-center">
                          <span className="text-zinc-500 text-xs uppercase tracking-wider">
                            Amount
                          </span>
                          <span className="text-zinc-200">
                            {event.data.amount}{" "}
                            <span className="text-emerald-500 text-xs">HBAR</span>
                          </span>
                        </div>
                      )}
                      <div className="flex gap-2 items-center">
                        <span className="text-zinc-500 text-xs uppercase tracking-wider">
                          Network
                        </span>
                        <span className="text-zinc-300">{event.data.network}</span>
                      </div>
                      {event.data.payload && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
                            View Payload
                          </summary>
                          <pre className="mt-2 text-xs text-zinc-400 whitespace-pre-wrap">
                            {JSON.stringify(event.data.payload, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
