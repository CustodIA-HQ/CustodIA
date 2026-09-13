"use client";

import { useEffect, useState } from "react";

type EthereumProvider = {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
};

type State =
  | { step: "idle" }
  | { step: "working"; label: string }
  | { step: "done"; wallet: string }
  | { step: "error"; message: string };

const post = async (body: Record<string, string>) => {
  const response = await fetch("/api/channels/connect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    wallet?: string;
  };
  if (!response.ok) throw new Error(json.error ?? "Verification failed. Try again.");
  return json;
};

export function ConnectWallet({
  token,
  channelLabel,
  chatUrl,
  expiresAt,
}: {
  token: string;
  channelLabel: string;
  chatUrl: string | null;
  expiresAt: number;
}) {
  const [state, setState] = useState<State>({ step: "idle" });
  // Resolved after mount: the server never sees window.ethereum.
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);
  const [metamaskUrl, setMetamaskUrl] = useState<string | null>(null);

  useEffect(() => {
    setHasWallet(Boolean((window as Window & { ethereum?: unknown }).ethereum));
    const { host, pathname, search } = window.location;
    setMetamaskUrl(`https://metamask.app.link/dapp/${host}${pathname}${search}`);
  }, []);

  const verify = async () => {
    const ethereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
    if (!ethereum) return;
    try {
      setState({ step: "working", label: "Connecting wallet…" });
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const address = accounts[0];
      if (!address) throw new Error("The wallet did not return an account.");
      const { message } = await post({ token, address });
      if (!message) throw new Error("Could not prepare the message to sign.");
      setState({ step: "working", label: "Waiting for your signature…" });
      const signature = (await ethereum.request({
        method: "personal_sign",
        params: [message, address],
      })) as string;
      setState({ step: "working", label: "Verifying…" });
      const result = await post({ token, address, signature });
      setState({ step: "done", wallet: result.wallet ?? address });
    } catch (error) {
      setState({
        step: "error",
        message: error instanceof Error ? error.message : "Verification failed. Try again.",
      });
    }
  };

  if (state.step === "done") {
    return (
      <>
        <p>
          Verified <strong style={{ overflowWrap: "anywhere" }}>{state.wallet}</strong>. You'll get
          a confirmation in {channelLabel}.
        </p>
        {chatUrl && (
          <a className="btn-primary" href={chatUrl}>
            Back to {channelLabel}
          </a>
        )}
      </>
    );
  }

  if (hasWallet === false) {
    return (
      <>
        <p>
          No wallet found in this browser. Open this page in your wallet app to sign. The link works
          until {new Date(expiresAt).toLocaleTimeString()}.
        </p>
        {metamaskUrl && (
          <a className="btn-primary" href={metamaskUrl}>
            Open in MetaMask
          </a>
        )}
        <p>Using another wallet? Copy this page's link into its built-in browser.</p>
      </>
    );
  }

  return (
    <>
      <button
        className="btn-primary"
        disabled={hasWallet === null || state.step === "working"}
        onClick={verify}
        type="button"
      >
        {state.step === "working" ? state.label : "Connect wallet and sign"}
      </button>
      {state.step === "error" && (
        <p className="chat-error" role="alert">
          {state.message}
        </p>
      )}
    </>
  );
}
