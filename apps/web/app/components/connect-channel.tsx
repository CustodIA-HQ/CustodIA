"use client";

import Link from "next/link";
import { useState } from "react";

type Pairing = { url: string; wallet: string; expiresAt: number };

const LABEL = { telegram: "Telegram", whatsapp: "WhatsApp" } as const;

export function ConnectChannel({ channel }: { channel: keyof typeof LABEL }) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [error, setError] = useState<{ message: string; needsSignIn: boolean } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const connect = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/channels/pair", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel }),
      });
      const body = (await response.json().catch(() => ({}))) as Partial<Pairing> & {
        error?: string;
      };
      if (!response.ok || !body.url || !body.wallet || !body.expiresAt) {
        setError({
          message: body.error ?? "The pairing link could not be created.",
          needsSignIn: response.status === 401,
        });
        return;
      }
      setPairing({ url: body.url, wallet: body.wallet, expiresAt: body.expiresAt });
    } finally {
      setIsLoading(false);
    }
  };

  if (pairing) {
    return (
      <>
        <p>
          Pairing <strong>{pairing.wallet}</strong>. The link expires at{" "}
          {new Date(pairing.expiresAt).toLocaleTimeString()}.
          {channel === "whatsapp" && " Send the prefilled CONNECT message as is."}
        </p>
        <a className="btn-primary" href={pairing.url} rel="noreferrer" target="_blank">
          Open {LABEL[channel]}
        </a>
      </>
    );
  }

  return (
    <>
      <button className="btn-primary" disabled={isLoading} onClick={connect} type="button">
        {isLoading ? "Creating link…" : `Connect ${LABEL[channel]}`}
      </button>
      {error && (
        <p className="chat-error" role="alert">
          {error.message} {error.needsSignIn && <Link href="/chat">Open web chat</Link>}
        </p>
      )}
    </>
  );
}
