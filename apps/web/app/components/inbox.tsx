"use client";

import { assetOf, etherscanTx, formatAmount } from "@custodia/vault";
import { useCallback, useEffect, useState } from "react";
import type { Address, Hex } from "viem";

type Inbox = {
  wallet: string;
  sessions: Array<{
    id: string;
    channel: string;
    lastAt: string;
    lastMessage: string;
    lastReply: string;
    runs: number;
  }>;
  actions: Array<{
    id: string;
    taskId: string;
    ensName: string;
    status: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string | null;
    txHash: string | null;
    reason: string | null;
    agent: boolean;
    at: string;
    pending: boolean;
  }>;
};

const CHANNEL = { telegram: "Telegram", whatsapp: "WhatsApp", web: "Web chat" } as const;
const REFRESH_MS = 20_000;

const when = (iso: string) => {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
};

const STATUS_LABEL: Record<string, string> = {
  proposed: "Needs your decision",
  previewed: "Queued",
  approved: "Approved",
  submitted: "Submitted",
  confirmed: "Done",
  reverted: "Reverted",
  refused: "Refused",
  declined: "Skipped",
  expired: "Expired",
};

/**
 * The wallet's sessions across WhatsApp, Telegram and web, and every agent
 * action or proposal — with YES/NO right here. Hidden until the wallet is
 * signed in (the API answers 401 without the session cookie).
 */
export function Inbox() {
  const [data, setData] = useState<Inbox | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(true);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/inbox");
      if (response.status === 401) {
        setSignedIn(false);
        setData(null);
        return;
      }
      if (!response.ok) return;
      setSignedIn(true);
      setData((await response.json()) as Inbox);
    } catch {
      // keep the last good state
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const answer = async (id: string, value: "yes" | "no") => {
    setBusy(id);
    try {
      await fetch(`/api/inbox/proposals/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ answer: value }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (signedIn === false) {
    return (
      <aside className="inbox inbox--locked" aria-label="Inbox">
        <p className="inbox__hint">
          Sign in with your wallet to see your sessions and alerts here.
        </p>
      </aside>
    );
  }
  if (!data) return null;

  const pending = data.actions.filter((a) => a.pending);

  return (
    <aside className="inbox" aria-label="Inbox">
      <button className="inbox__toggle" onClick={() => setOpen((v) => !v)} type="button">
        Inbox{pending.length > 0 && <span className="inbox__badge">{pending.length}</span>}
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <>
          <section>
            <h3>Needs your decision</h3>
            {pending.length === 0 ? (
              <p className="inbox__hint">Nothing waiting on you.</p>
            ) : (
              pending.map((a) => (
                <article className="inbox__card inbox__card--pending" key={a.id}>
                  <p>{a.reason?.replace(/^agent: /, "")}</p>
                  <p className="inbox__meta">
                    Swap {formatAmount(a.tokenIn as Address, BigInt(a.amountIn))} →{" "}
                    {assetOf(a.tokenOut as Address)} · {a.ensName}
                  </p>
                  <div className="inbox__actions">
                    <button
                      disabled={busy === a.id}
                      onClick={() => void answer(a.id, "yes")}
                      type="button"
                    >
                      Yes, do it
                    </button>
                    <button
                      disabled={busy === a.id}
                      onClick={() => void answer(a.id, "no")}
                      type="button"
                    >
                      No, skip
                    </button>
                  </div>
                </article>
              ))
            )}
          </section>

          <section>
            <h3>Activity</h3>
            {data.actions.filter((a) => !a.pending).length === 0 ? (
              <p className="inbox__hint">No agent activity yet.</p>
            ) : (
              data.actions
                .filter((a) => !a.pending)
                .slice(0, 8)
                .map((a) => (
                  <article className="inbox__card" key={a.id}>
                    <p>
                      <strong>{STATUS_LABEL[a.status] ?? a.status}</strong>
                      {a.agent && <span className="inbox__tag">agent</span>} ·{" "}
                      {formatAmount(a.tokenIn as Address, BigInt(a.amountIn))}
                      {a.amountOut
                        ? ` → ${formatAmount(a.tokenOut as Address, BigInt(a.amountOut))}`
                        : ""}
                    </p>
                    <p className="inbox__meta">
                      {when(a.at)} · {a.ensName}
                      {a.txHash && (
                        <>
                          {" · "}
                          <a href={etherscanTx(a.txHash as Hex)} rel="noreferrer" target="_blank">
                            tx
                          </a>
                        </>
                      )}
                      {a.reason && a.status !== "confirmed" && (
                        <> · {a.reason.replace(/^agent: /, "")}</>
                      )}
                    </p>
                  </article>
                ))
            )}
          </section>

          <section>
            <h3>Sessions</h3>
            {data.sessions.length === 0 ? (
              <p className="inbox__hint">No conversations yet.</p>
            ) : (
              data.sessions.slice(0, 10).map((s) => (
                <article className="inbox__card" key={s.id}>
                  <p>
                    <strong>{CHANNEL[s.channel as keyof typeof CHANNEL] ?? s.channel}</strong>
                    <span className="inbox__meta">
                      {" "}
                      · {when(s.lastAt)} · {s.runs} message{s.runs === 1 ? "" : "s"}
                    </span>
                  </p>
                  {s.lastMessage && <p className="inbox__meta">You: {s.lastMessage}</p>}
                  {s.lastReply && <p className="inbox__meta">CustodIA: {s.lastReply}</p>}
                </article>
              ))
            )}
          </section>
        </>
      )}
    </aside>
  );
}
