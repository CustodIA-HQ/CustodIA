"use client";

import { constraintsHash, MANDATE_DOMAIN, MANDATE_TYPES, type UISpec } from "@custodia/schema";
import { useEffect, useState } from "react";
import { constraintsFor } from "../../mandate-constraints";

type EthereumProvider = {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
};

const MANDATE_TTL_S = 30 * 24 * 60 * 60;

/**
 * Sign the mandate for a draft task on the task page — the same typed data
 * and the same /api/mandate route as web chat, so a task that started in
 * WhatsApp or Telegram is authorized here. Without an injected wallet the
 * page hands off to the MetaMask app with a deep link.
 */
export function SignMandate({
  taskId,
  ensName,
  owner,
  agent,
  proposalId,
  conversationId,
  uiSpec,
  onSigned,
}: {
  taskId: string;
  ensName: string;
  owner: string;
  agent: string;
  proposalId: string;
  conversationId: string;
  uiSpec: UISpec;
  onSigned: () => Promise<void>;
}) {
  const allocation = uiSpec.components.find((c) => c.type === "allocation_selector");
  const rebalanceToggle = uiSpec.components.find((c) => c.type === "permission_toggle");
  const drawdown = uiSpec.components.find((c) => c.type === "range_slider");
  const tradeSize = uiSpec.components.find((c) => c.type === "amount_selector");
  const [allowRebalance, setAllowRebalance] = useState(
    rebalanceToggle?.type === "permission_toggle" ? rebalanceToggle.default : false,
  );
  const [targetEthPct, setTargetEthPct] = useState(
    allocation?.type === "allocation_selector" ? (allocation.defaultPct[0] ?? 50) : 50,
  );
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);
  const [metamaskUrl, setMetamaskUrl] = useState<string | null>(null);

  useEffect(() => {
    setHasWallet(Boolean((window as Window & { ethereum?: unknown }).ethereum));
    const { host, pathname, search } = window.location;
    setMetamaskUrl(`https://metamask.app.link/dapp/${host}${pathname}${search}`);
  }, []);

  const sign = async () => {
    const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
    if (!ethereum) return;
    setState("working");
    setMessage("");
    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0];
      if (!address || address.toLowerCase() !== owner.toLowerCase()) {
        throw new Error(`Connect wallet ${owner.slice(0, 8)}… — this task belongs to it.`);
      }
      const constraints = constraintsFor(uiSpec, {
        allowRebalance,
        targetEthPct: allowRebalance ? targetEthPct : undefined,
      });
      const iat = Math.floor(Date.now() / 1_000);
      const exp = iat + MANDATE_TTL_S;
      const mandate = {
        kind: "custodia.mandate.task.1" as const,
        taskId,
        owner,
        agent,
        ens: ensName,
        constraints,
        iat,
        exp,
      };
      const typedMessage = {
        kind: mandate.kind,
        taskId,
        owner,
        agent,
        ens: ensName,
        constraintsHash: constraintsHash(constraints),
        iat: String(iat),
        exp: String(exp),
      };
      const signature = await ethereum.request({
        method: "eth_signTypedData_v4",
        params: [
          address,
          JSON.stringify({
            types: {
              EIP712Domain: [
                { name: "name", type: "string" },
                { name: "version", type: "string" },
                { name: "chainId", type: "uint256" },
              ],
              ...MANDATE_TYPES,
            },
            domain: MANDATE_DOMAIN,
            primaryType: "Mandate",
            message: typedMessage,
          }),
        ],
      });
      if (typeof signature !== "string") throw new Error("The wallet did not return a signature.");
      const response = await fetch("/api/mandate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId, proposalId, mandate, signature }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The task could not be authorized.");
      setState("done");
      await onSigned();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Signing failed. Try again.");
      setState("error");
    }
  };

  return (
    <section className="guard-page__details" id="sign">
      <p className="guard-card__eyebrow">Authorization</p>
      <h2>Sign the boundary</h2>
      <p className="guard-page__muted">
        One EIP-712 signature makes this mandate the agent's limits for {ensName}. It does not move
        funds; it is published as ENS records and enforced by the policy engine and, once you fund a
        vault, by the vault contract.
      </p>
      <ul className="wallet-card__tokens">
        {drawdown?.type === "range_slider" && (
          <li>
            <div>
              <strong>Max drawdown</strong>
              <span>{drawdown.max}% — the agent moves to USDC beyond this</span>
            </div>
          </li>
        )}
        {tradeSize?.type === "amount_selector" && (
          <li>
            <div>
              <strong>Max per trade</strong>
              <span>${tradeSize.max.toLocaleString("en-US")}</span>
            </div>
          </li>
        )}
        <li>
          <div>
            <strong>Expires</strong>
            <span>in 30 days</span>
          </div>
        </li>
      </ul>
      {rebalanceToggle?.type === "permission_toggle" && (
        <label>
          <input
            checked={allowRebalance}
            disabled={state === "working"}
            onChange={(e) => setAllowRebalance(e.target.checked)}
            type="checkbox"
          />{" "}
          Allow the agent to rebalance (it proposes; you confirm each time)
        </label>
      )}
      {allowRebalance && (
        <label>
          Target ETH share {targetEthPct}% / USDC {100 - targetEthPct}%{" "}
          <input
            disabled={state === "working"}
            max={100}
            min={0}
            onChange={(e) => setTargetEthPct(Number(e.target.value))}
            step={5}
            type="range"
            value={targetEthPct}
          />
        </label>
      )}
      {state === "done" ? (
        <p>Signed. Publishing to ENS — this page updates when the task is live.</p>
      ) : hasWallet === false ? (
        <>
          <p className="guard-page__muted">
            No wallet in this browser. Open this page in your wallet app to sign.
          </p>
          {metamaskUrl && (
            <a className="btn-primary" href={metamaskUrl}>
              Open in MetaMask
            </a>
          )}
        </>
      ) : (
        <div className="guard-preview__action">
          <button disabled={hasWallet === null || state === "working"} onClick={sign} type="button">
            {state === "working" ? "Waiting for your signature…" : "Sign with wallet"}
          </button>
        </div>
      )}
      {state === "error" && (
        <p className="chat-error" role="alert">
          {message}
        </p>
      )}
    </section>
  );
}
