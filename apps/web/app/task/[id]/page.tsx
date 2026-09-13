"use client";

import { evaluateAllocations } from "@custodia/decision";
import { ownerNameFromTaskEns, taskDirectoryPath } from "@custodia/ens/paths";
import type { Mandate, PolicyDecision, UISpec } from "@custodia/schema";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type ComponentProps, useCallback, useEffect, useRef, useState } from "react";
import { VaultPanel } from "./vault-panel";

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
  vault: ComponentProps<typeof VaultPanel>["vault"];
  actions: ComponentProps<typeof VaultPanel>["actions"];
  signers: { execution: string | null; policy: string | null };
  mandateHash: string | null;
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
  const [side, setSide] = useState("sell");
  const [notional, setNotional] = useState(1);
  const [targetPct, setTargetPct] = useState(50);
  const [feeBps, setFeeBps] = useState(5);
  const [slippageBps, setSlippageBps] = useState(10);
  const [replay, setReplay] = useState<{
    equityUsd: number;
    buyAndHoldUsd: number;
    assumptions: string;
    results: Array<{ observation: { ts: number; priceUsd: number }; equityUsd: number }>;
  } | null>(null);
  const pendingRequest = useRef<string | null>(null);
  const [lastDecision, setLastDecision] = useState<PolicyDecision | null>(null);

  const [priceUsd, setPriceUsd] = useState<number | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(`/api/tasks/${id}`);
    const payload = (await response.json()) as TaskPayload & { error?: string };
    if (!response.ok) {
      setError(payload.error ?? "Could not load task.");
      return;
    }
    setData(payload);
    setError(null);
    // Live ETH price sizes the vault's on-chain limits at deployment.
    fetch("/api/market")
      .then((r) => (r.ok ? r.json() : null))
      .then((m: { market?: { priceUsd?: number } } | null) => {
        if (typeof m?.market?.priceUsd === "number") setPriceUsd(m.market.priceUsd);
      })
      .catch(() => undefined);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const simulate = async () => {
    setBusy(true);
    try {
      pendingRequest.current ??= crypto.randomUUID();
      const response = await fetch(`/api/tasks/${id}/simulate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fromAsset: side === "buy" ? "USDC" : "ETH",
          toAsset: side === "buy" ? "ETH" : "USDC",
          notionalUsd: notional,
          requestId: pendingRequest.current,
          feeBps,
          slippageBps,
        }),
      });
      const payload = (await response.json()) as { error?: string; decision?: PolicyDecision };
      if (!response.ok) throw new Error(payload.error ?? "Simulate failed.");
      pendingRequest.current = null;
      setLastDecision(payload.decision ?? null);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Simulate failed.");
    } finally {
      setBusy(false);
    }
  };

  const replayHistory = async () => {
    setBusy(true);
    try {
      const response = await fetch(`/api/tasks/${id}/replay`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetEthPct: targetPct, feeBps, slippageBps }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Replay failed");
      setReplay(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Replay failed");
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

  const paper = [...data.receipts].filter((r) => r.kind === "paper").sort((a, b) => b.id - a.id)[0]
    ?.payload as
    | {
        state: { eth: number; usdc: number; feesUsd: number };
        equityUsd: number;
        pnlUsd: number;
        observation: { ts: number; priceUsd: number };
      }
    | undefined;
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

      <VaultPanel
        actions={data.actions ?? []}
        mandate={data.mandate}
        mandateHash={data.mandateHash ?? null}
        onChanged={load}
        priceUsd={priceUsd}
        signers={data.signers ?? { execution: null, policy: null }}
        taskId={data.task.id}
        taskStatus={data.task.status}
        vault={data.vault ?? null}
      />

      <section className="guard-page__details">
        <p className="guard-card__eyebrow">Autonomy</p>
        <h2>Simulate and revoke</h2>
        <p className="guard-page__muted">
          Real market data · simulated execution. A separate paper ledger starts from your Sepolia
          ETH/USDC balances. Fills default to a 5 bps fee and 10 bps adverse slippage; gas,
          liquidity impact and latency are not modeled. No tokens move. Revoke blocks new fills.
        </p>
        <label>
          Direction{" "}
          <select
            disabled={busy}
            value={side}
            onChange={(e) => {
              setSide(e.target.value);
              pendingRequest.current = null;
            }}
          >
            <option value="sell">Sell ETH for USDC</option>
            <option value="buy">Buy ETH with USDC</option>
          </select>
        </label>
        <label>
          Paper notional (USD){" "}
          <input
            disabled={busy}
            type="number"
            min="0.01"
            step="0.01"
            value={notional}
            onChange={(e) => {
              setNotional(Number(e.target.value));
              pendingRequest.current = null;
            }}
          />
        </label>
        <label>
          Fee (basis points; 100 = 1%){" "}
          <input
            type="number"
            min="0"
            max="1000"
            disabled={busy}
            value={feeBps}
            onChange={(e) => {
              setFeeBps(Number(e.target.value));
              pendingRequest.current = null;
            }}
          />
        </label>
        <label>
          Adverse slippage (basis points){" "}
          <input
            type="number"
            min="0"
            max="1000"
            disabled={busy}
            value={slippageBps}
            onChange={(e) => {
              setSlippageBps(Number(e.target.value));
              pendingRequest.current = null;
            }}
          />
        </label>
        <div className="guard-preview__action">
          <button
            disabled={busy || data.task.status !== "active"}
            onClick={() => void simulate()}
            type="button"
          >
            {busy ? "Working…" : "Simulate priced trade"}
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
        <h2>Paper portfolio</h2>
        {paper ? (
          <>
            <p>
              {paper.state.eth.toFixed(6)} ETH / {paper.state.usdc.toFixed(2)} USDC
            </p>
            <p>
              Equity ${paper.equityUsd.toFixed(2)} · P&amp;L ${paper.pnlUsd.toFixed(2)} · fees $
              {paper.state.feesUsd.toFixed(4)}
            </p>
            <p>
              Marked at ${paper.observation.priceUsd.toFixed(2)} on{" "}
              {new Date(paper.observation.ts * 1000).toISOString()}. Values update when a paper
              action is recorded.
            </p>
          </>
        ) : (
          <p>No paper ledger yet. The first trade request snapshots supported wallet holdings.</p>
        )}
        <h2>Historical replay</h2>
        <label>
          Target ETH %{" "}
          <input
            type="number"
            min="0"
            max="100"
            value={targetPct}
            onChange={(e) => setTargetPct(Number(e.target.value))}
          />
        </label>
        <button disabled={busy || !data.mandate} type="button" onClick={() => void replayHistory()}>
          Replay available history
        </button>
        {replay && (
          <>
            <p>
              Final equity ${replay.equityUsd.toFixed(2)} · buy and hold $
              {replay.buyAndHoldUsd.toFixed(2)}
            </p>
            <p>{replay.assumptions}</p>
            <details>
              <summary>Replay observations ({replay.results.length})</summary>
              <div style={{ overflowX: "auto" }}>
                <table>
                  <thead>
                    <tr>
                      <th>Time (UTC)</th>
                      <th>ETH price</th>
                      <th>Paper equity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {replay.results.map((r) => (
                      <tr key={r.observation.ts}>
                        <td>{new Date(r.observation.ts * 1000).toISOString()}</td>
                        <td>{r.observation.priceUsd.toFixed(2)}</td>
                        <td>{r.equityUsd.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        )}
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
