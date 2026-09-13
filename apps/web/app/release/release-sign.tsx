"use client";

import { useEffect, useState } from "react";

type EthereumProvider = {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
};

const post = async (body: Record<string, string>) => {
  const response = await fetch("/api/ens/release-chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!response.ok) throw new Error(json.error ?? "Release failed. Try again.");
  return json;
};

export function ReleaseSign({
  token,
  name,
  wallet,
}: {
  token: string;
  name: string;
  wallet: string;
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

  const release = async () => {
    const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
    if (!ethereum) return;
    setState("working");
    try {
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0];
      if (!address) throw new Error("The wallet did not return an account.");
      if (address.toLowerCase() !== wallet.toLowerCase())
        throw new Error("Connect the wallet this link was issued for.");
      const { message: toSign } = await post({ token, address });
      if (!toSign) throw new Error("Could not prepare the message to sign.");
      const signature = (await ethereum.request({
        method: "personal_sign",
        params: [toSign, address],
      })) as string;
      await post({ token, address, signature });
      setState("done");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Release failed. Try again.");
      setState("error");
    }
  };

  if (state === "done")
    return (
      <p>
        Release requested. The records are being cleared on Sepolia; the bot will confirm with the
        transaction.
      </p>
    );
  if (hasWallet === false) {
    return (
      <>
        <p>No wallet in this browser. Open this page in your wallet app to sign.</p>
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
        onClick={release}
        type="button"
      >
        {state === "working" ? "Waiting for your signature…" : `Sign and release ${name}`}
      </button>
      {state === "error" && (
        <p className="chat-error" role="alert">
          {message}
        </p>
      )}
    </>
  );
}
