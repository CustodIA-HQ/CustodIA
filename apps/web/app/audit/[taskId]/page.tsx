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
      <div className="audit-page audit-page--empty">
        [ERR] DATABASE_URL not configured
      </div>
    );
  }

  const db = createDb();

  const [proposal] = await db.select().from(tables.proposals).where(eq(tables.proposals.taskId, taskId)).limit(1);

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
    <div className="audit-page">
      <div className="audit-page__inner">
        <header className="audit-page__header">
          <h1 className="audit-page__title">Audit Log: {taskId}</h1>
          <div className="audit-page__meta">
            <span>Owner: <strong>{proposal.ownerWallet}</strong></span>
            <span>Version: <strong>{proposal.version}</strong></span>
            <span>Created: {proposal.createdAt.toLocaleString()}</span>
          </div>
        </header>

        <div className="audit-page__list">
          {timeline.length === 0 ? (
            <div className="audit-page__empty">No events found for this task.</div>
          ) : (
            timeline.map((event) => (
              <div key={event.id} className="audit-page__item">
                <div className="audit-page__dot" />

                <div className="audit-page__item-head">
                  <span className="audit-page__item-title">{event.title}</span>
                  <span className="audit-page__item-time">{event.timestamp.toLocaleString()}</span>
                </div>

                <div className="audit-page__card">
                  {event.type === "event" && (
                    <div>
                      <div className="audit-page__label">Stage: {event.data.stage} | Type: {event.data.type}</div>
                      <pre className="audit-page__pre">
                        {JSON.stringify(event.data.payload, null, 2)}
                      </pre>
                    </div>
                  )}

                  {event.type === "proposal" && (
                    <div>
                      <div>
                        <span className="audit-page__label">Hash</span>
                        <span className="audit-page__value--accent">{event.data.hash}</span>
                      </div>
                      <details>
                        <summary className="audit-page__summary">View Proposal Body</summary>
                        <pre className="audit-page__pre">
                          {JSON.stringify(event.data.body, null, 2)}
                        </pre>
                      </details>
                    </div>
                  )}

                  {event.type === "receipt" && (
                    <div>
                      <div>
                        <span className="audit-page__label">Tx ID</span>
                        <span className="audit-page__value--accent">{event.data.txId}</span>
                      </div>
                      {event.data.amount && (
                        <div>
                          <span className="audit-page__label">Amount</span>
                          <span className="audit-page__value">{event.data.amount} <span className="audit-page__value--accent">HBAR</span></span>
                        </div>
                      )}
                      <div>
                        <span className="audit-page__label">Network</span>
                        <span className="audit-page__value">{event.data.network}</span>
                      </div>
                      {event.data.payload && (
                        <details>
                          <summary className="audit-page__summary">View Payload</summary>
                          <pre className="audit-page__pre">
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
