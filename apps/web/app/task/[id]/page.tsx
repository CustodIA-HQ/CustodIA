"use client";

import { evaluateAllocations } from "@custodia/decision";
import { ownerNameFromTaskEns, taskDirectoryPath } from "@custodia/ens/paths";
import type { Mandate, PolicyDecision, UISpec } from "@custodia/schema";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type TaskPayload = {
  task: { id: string; ensName: string; status: string; template: string | null };
  mandate: Mandate | null;
  proposal: {
    id: string;
    hash: string;
    body: { uiSpec?: UISpec; market?: { priceUsd?: number } };
  } | null;
  receipts: Array<{ id: number; kind: string; txId: string; payload: unknown }>;
  notice: string;
};

/** Short, linked receipt id: Etherscan for Sepolia txs, HashScan for Hedera, plain for simulated. */
const shortId = (id: string) => (id.length > 22 ? `${id.slice(0, 10)}…${id.slice(-6)}` : id);
const receiptHref = (kind: string, txId: string): string | null => {
  if (kind === "ens_tx" && txId.startsWith("0x")) return `https://sepolia.etherscan.io/tx/${txId}`;
  if (kind === "x402" && /^0\.0\.\d+[@-]/.test(txId)) {
    return `https://hashscan.io/testnet/transaction/${txId.replace("@", "-").replace(/\.(\d+)$/, "-$1")}`;
  }
  return null;
};

const getEthereum = () => {
  const provider = (
    window as Window & {
      ethereum?: {
        request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
      };
    }
  ).ethereum;
  if (!provider) throw new Error("Connect a browser wallet.");
  return provider;
};

export default function TaskReviewPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [data, setData] = useState<TaskPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastDecision, setLastDecision] = useState<PolicyDecision | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/tasks/${id}`);
    const payload = (await response.json()) as TaskPayload & { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Could not load task.");
      return;
    }
    setData(payload);
    setError(null);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const simulate = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/tasks/${id}/simulate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fromAsset: "ETH", toAsset: "USDC", notionalUsd: 1 }),
      });
      const payload = (await response.json()) as { error?: string; decision?: PolicyDecision };
      if (!response.ok) throw new Error(payload.error ?? "Simulate failed.");
      setLastDecision(payload.decision ?? null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Simulate failed.");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    try {
      const message = `CustodIA revoke task ${id}`;
      const accounts = await getEthereum().request({ method: "eth_requestAccounts" });
      const address = Array.isArray(accounts) ? String(accounts[0]) : "";
      const signature = await getEthereum().request({
        method: "personal_sign",
        params: [message, address],
      });
      const response = await fetch(`/api/tasks/${id}/revoke`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, signature }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Revoke failed.");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Revoke failed.");
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) {
    return (
      <main className="guard-page guard-page--error">
        <p className="guard-card__eyebrow">Task review</p>
        <h1>Unable to open this task</h1>
        <p>{error}</p>
        <Link href="/chat">Return to chat</Link>
      </main>
    );
  }
  if (!data) {
    return (
      <main className="guard-page">
        <p>Loading task…</p>
      </main>
    );
  }

  const uiSpec = data.proposal?.body.uiSpec;
  const allocation = uiSpec?.components.find((c) => c.type === "allocation_selector");
  const protection = uiSpec?.components.find((c) => c.type === "protection_simulation");
  const currentEth = allocation?.type === "allocation_selector" ? allocation.defaultPct[0] : 50;
  const currentUsdc = 100 - currentEth;
  const candidates = evaluateAllocations({
    ethUsd: currentEth,
    usdcUsd: currentUsdc,
    allowRebalance: true,
    minTradeUsd: 0,
  });
  const rejected = candidates.filter((c) => !c.feasible || c.distance > 15).slice(0, 4);

  return (
    <main className="guard-page">
      <div className="guard-page__topbar">
        <Link href="/chat">← Back to chat</Link>
        <span>Task review · simulated execution</span>
      </div>
      <section className="guard-page__hero">
        <p className="guard-card__eyebrow">Durable review</p>
        <h1>{data.task.ensName}</h1>
        <p>
          Status <strong>{data.task.status}</strong>. Workflow subdomain of the owner ENS identity.
          Execution in this build is simulated and labeled as such.
        </p>
        <span className="guard-page__status">Status: {data.task.status}</span>
      </section>

      <p className="wallet-card__note" role="note">
        {data.notice}
      </p>

      {allocation?.type === "allocation_selector" && (
        <section className="guard-page__details">
          <p className="guard-card__eyebrow">Current vs proposed</p>
          <h2>Allocation</h2>
          <div className="guard-boundaries">
            <div className="guard-boundary">
              <span>Proposed</span>
              <strong>
                {allocation.defaultPct[0]}% ETH / {allocation.defaultPct[1]}% USDC
              </strong>
            </div>
            <div className="guard-boundary">
              <span>Do nothing</span>
              <strong>Keep current mix — always a candidate</strong>
            </div>
          </div>
          {rejected.length > 0 && (
            <p className="guard-page__muted">
              Distant alternatives (filtered):{" "}
              {rejected.map((c) => `${c.ethPct}/${c.usdcPct}`).join(", ")}
            </p>
          )}
        </section>
      )}

      {protection?.type === "protection_simulation" && (
        <section className="guard-page__details">
          <p className="guard-card__eyebrow">Protection simulation</p>
          <h2>Model estimate — not a quote</h2>
          <div className="guard-boundaries">
            <div className="guard-boundary">
              <span>Deductible</span>
              <strong>${protection.deductibleUsd}</strong>
            </div>
            <div className="guard-boundary">
              <span>Duration</span>
              <strong>{protection.durationDays} days</strong>
            </div>
            <div className="guard-boundary">
              <span>Premium (estimate)</span>
              <strong>${protection.premiumEstimateUsd}</strong>
            </div>
          </div>
          <p className="guard-page__muted">
            This is a model estimate, not a venue quote, and not an insurance contract.
          </p>
        </section>
      )}

      <section className="guard-page__details">
        <p className="guard-card__eyebrow">Autonomy</p>
        <h2>Simulate and revoke</h2>
        <p className="guard-page__muted">
          Simulate runs the policy engine against a $1 ETH→USDC rebalance and records a simulated
          receipt. Revoke requires a fresh wallet signature and blocks new actions.
        </p>
        <div className="guard-preview__action">
          <button
            disabled={busy || data.task.status !== "active"}
            onClick={() => void simulate()}
            type="button"
          >
            {busy ? "Working…" : "Simulate action"}
          </button>
          <button
            disabled={busy || data.task.status === "revoked"}
            onClick={() => void revoke()}
            type="button"
          >
            Revoke authorization
          </button>
        </div>
        {lastDecision && (
          <p className={lastDecision.allowed ? "guard-page__muted" : "chat-error"}>
            {lastDecision.allowed ? "Allowed: " : "Refused: "}
            {lastDecision.reason}
          </p>
        )}
        {error && <p className="chat-error">{error}</p>}
      </section>

      <section className="guard-page__details">
        <p className="guard-card__eyebrow">Receipts</p>
        <h2>Audit</h2>
        {data.receipts.length === 0 ? (
          <p className="guard-page__muted">No receipts yet.</p>
        ) : (
          <ul className="wallet-card__tokens receipt-list">
            {data.receipts.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>{row.kind}</strong>
                  {receiptHref(row.kind, row.txId) ? (
                    <a
                      className="receipt-id"
                      href={receiptHref(row.kind, row.txId) ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      title={row.txId}
                    >
                      {shortId(row.txId)} ↗
                    </a>
                  ) : (
                    <span className="receipt-id" title={row.txId}>
                      {shortId(row.txId)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="guard-page__muted">
          <Link
            href={taskDirectoryPath(
              ownerNameFromTaskEns(data.task.ensName, data.task.id),
              data.task.id,
              data.task.template,
            )}
          >
            Open generated UX ↗
          </Link>
        </p>
      </section>
    </main>
  );
}
