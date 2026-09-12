"use client";

import { useEffect, useState } from "react";
import { claimMessage } from "../ens-claim";

type Availability = {
  available: boolean;
  error: string | null;
  label: string | null;
  name: string | null;
  yours?: boolean;
};

export function EnsClaimForm({
  wallet,
  parentName,
  onClaimed,
}: {
  wallet: `0x${string}`;
  parentName: string;
  onClaimed: (ensName: string) => void;
}) {
  const [draft, setDraft] = useState("");
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!draft.trim()) {
      setAvailability(null);
      return;
    }
    const handle = window.setTimeout(() => {
      void (async () => {
        const response = await fetch(`/api/ens/available?label=${encodeURIComponent(draft.trim())}`);
        const payload = (await response.json()) as Availability;
        setAvailability(payload);
      })();
    }, 350);
    return () => window.clearTimeout(handle);
  }, [draft]);

  const claim = async () => {
    if (!availability?.available || !availability.name || !availability.label) return;
    setBusy(true);
    setError(null);
    try {
      const provider = (window as Window & { ethereum?: { request(args: { method: string; params?: readonly unknown[] }): Promise<unknown> } }).ethereum;
      if (!provider) throw new Error("Connect a browser wallet.");
      const message = claimMessage(wallet, availability.name);
      const signature = await provider.request({
        method: "personal_sign",
        params: [message, wallet],
      });
      const response = await fetch("/api/ens/claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: availability.label, message, signature }),
      });
      const payload = (await response.json()) as { error?: string; ensName?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not mint that ENS name.");
      onClaimed(payload.ensName ?? availability.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not mint that ENS name.");
    } finally {
      setBusy(false);
    }
  };

  const ready = Boolean(availability?.available && availability.name);

  return (
    <form
      className="ens-claim"
      onSubmit={(event) => {
        event.preventDefault();
        void claim();
      }}
    >
      <p className="ens-claim__label">Choose your ENS identity</p>
      <p className="ens-claim__hint">
        This name is minted under {parentName}. Every workflow is a subdomain of it, and the
        claim signature must match this wallet.
      </p>
      <div className="ens-claim__row">
        <input
          aria-label="ENS label"
          autoComplete="off"
          onChange={(event) => setDraft(event.target.value)}
          placeholder="alice"
          spellCheck={false}
          value={draft}
        />
        <span className="ens-claim__suffix">.{parentName}</span>
      </div>
      {availability?.name && (
        <p className={availability.available ? "ens-claim__ok" : "ens-claim__err"} role="status">
          {availability.available
            ? availability.yours
              ? `${availability.name} is already yours — sign to re-attach.`
              : `${availability.name} is available.`
            : availability.error}
        </p>
      )}
      {error && (
        <p className="ens-claim__err" role="alert">
          {error}
        </p>
      )}
      <button disabled={!ready || busy} type="submit">
        {busy ? "Minting…" : "Sign and mint"}
      </button>
    </form>
  );
}
