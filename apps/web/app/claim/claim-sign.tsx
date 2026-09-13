"use client";

import { useEffect, useState } from "react";

type EthereumProvider = {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
};

const post = async (body: Record<string, string>) => {
  const response = await fetch("/api/ens/claim-chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    ok?: boolean;
  };
  if (!response.ok) throw new Error(json.error ?? "Claim failed. Try again.");
  return json;
};

export function ClaimSign({
  token,
  name,
  wallet,
  expiresAt,
}: {
  token: string;
  name: string;
  wallet: string;
  expiresAt: number;
}) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);
  const [metamaskUrl, setMetamaskUrl] = useState<string | null>(null);

  useEffect(() => {
    setHasWallet(Boolean((window as Window & { ethereum?: unknown }).ethereum));
    const { host, pathname, search } = window.location;
    setMetamaskUrl(`https://metamask.app.link/dapp/${host}${pathname}${search}`);
  }, []);

  const claim = async () => {
    const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
    if (!ethereum) return;
    setState("working");
    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0];
      if (!address) throw new Error("The wallet did not return an account.");
      if (address.toLowerCase() !== wallet.toLowerCase()) {
        throw new Error(`Connect wallet ${wallet.slice(0, 8)}… — this link was issued for it.`);
      }
      const { message: toSign } = await post({ token, address });
      if (!toSign) throw new Error("Could not prepare the message to sign.");
      const signature = (await ethereum.request({
        method: "personal_sign",
        params: [toSign, address],
      })) as string;
      await post({ token, address, signature });
      setState("done");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Claim failed. Try again.");
      setState("error");
    }
  };

  if (state === "done") {
    return (
      <p>
        <strong>{name}</strong> is reserved for you. The on-chain attach is running; the bot will
        confirm with the transaction.
      </p>
    );
  }
  if (hasWallet === false) {
    return (
      <>
        <p>
          No wallet in this browser. Open this page in your wallet app to sign — the link works
          until {new Date(expiresAt).toLocaleTimeString()}.
        </p>
        {metamaskUrl && (
          <a className="btn-primary" href={metamaskUrl}>
            Open in MetaMask
          </a>
        )}
      </>
    );
  }
  return (
    <>
      <button
        className="btn-primary"
        disabled={hasWallet === null || state === "working"}
        onClick={claim}
        type="button"
      >
        {state === "working" ? "Waiting for your signature…" : `Sign and claim ${name}`}
      </button>
      {state === "error" && (
        <p className="chat-error" role="alert">
          {message}
        </p>
      )}
    </>
  );
}
