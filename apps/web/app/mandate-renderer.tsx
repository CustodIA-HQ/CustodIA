"use client";

/**
 * MandateRenderer
 *
 * Renders a validated UISpec as interactive form controls, collects the
 * human's choices, structures an EIP-712 Mandate payload, and requests a
 * wallet signature via window.ethereum.
 *
 * Architecture contract (HARD):
 *   - This component PROPOSES.  It never submits a transaction on its own.
 *   - The human AUTHORISES by clicking "Approve & Sign".
 *   - The policy engine (@custodia/policy) validates and EXECUTES.
 *
 * Stack: React 19 + Next.js 15 App Router · viem · @custodia/schema (Zod)
 * NO wagmi — the project uses window.ethereum directly (see chat-section.tsx).
 */

import {
  type Address,
  type Constraint,
  constraintsHash,
  MANDATE_DOMAIN,
  MANDATE_TYPES,
  type UISpec,
  UISpecSchema,
} from "@custodia/schema";
import { useCallback, useReducer, useState } from "react";
import { keccak256, toHex } from "viem";

// ─── Types ────────────────────────────────────────────────────────────────────

type EthereumProvider = {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
};

/** Mutable user choices extracted from the UISpec defaults. */
type FormState = {
  /** ETH allocation percentage (0–100). USDC = 100 - ethPct. */
  ethPct: number;
  /** Max tolerated drawdown, expressed as a negative percentage (e.g. -15). */
  maxDrawdownPct: number;
  /** Maximum notional USD per rebalance cycle. */
  maxTradeUsd: number;
  /** Whether the agent is permitted to rebalance autonomously. */
  allowRebalance: boolean;
};

type Action =
  | { type: "SET_ETH_PCT"; value: number }
  | { type: "SET_DRAWDOWN"; value: number }
  | { type: "SET_TRADE_USD"; value: number }
  | { type: "SET_ALLOW_REBALANCE"; value: boolean };

type SignatureResult = {
  /** Raw EIP-712 signature from the wallet. */
  signature: `0x${string}`;
  /** keccak256 of the signature — used as the value written to ENS. */
  mandateHash: `0x${string}`;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const getEthereum = (): EthereumProvider => {
  const provider = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  if (!provider)
    throw new Error("No wallet detected. Install MetaMask or another browser wallet.");
  return provider;
};

const asAddress = (value: unknown): Address => {
  if (typeof value !== "string") throw new Error("Wallet did not return an address.");
  // Minimal hex address normalisation without wagmi.
  const lower = value.toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(lower)) throw new Error(`Invalid address: ${value}`);
  return lower as Address;
};

/**
 * Initialises FormState from the validated UISpec defaults so the sliders
 * always open at the agent's suggested values.
 */
const initFormState = (spec: UISpec): FormState => {
  const allocation = spec.components.find((c) => c.type === "allocation_selector");
  const drawdown = spec.components.find((c) => c.type === "range_slider");
  const tradeSize = spec.components.find((c) => c.type === "amount_selector");
  const rebalance = spec.components.find((c) => c.type === "permission_toggle");

  return {
    ethPct: allocation?.type === "allocation_selector" ? allocation.defaultPct[0] : 60,
    maxDrawdownPct: drawdown?.type === "range_slider" ? drawdown.default : -15,
    maxTradeUsd: tradeSize?.type === "amount_selector" ? tradeSize.default : 5000,
    allowRebalance: rebalance?.type === "permission_toggle" ? rebalance.default : false,
  };
};

const formReducer = (state: FormState, action: Action): FormState => {
  switch (action.type) {
    case "SET_ETH_PCT":
      return { ...state, ethPct: action.value };
    case "SET_DRAWDOWN":
      return { ...state, maxDrawdownPct: action.value };
    case "SET_TRADE_USD":
      return { ...state, maxTradeUsd: action.value };
    case "SET_ALLOW_REBALANCE":
      return { ...state, allowRebalance: action.value };
  }
};

/**
 * Derives the canonical Constraint array from the current FormState.
 * Ordering is deterministic — constraintsHash sorts by type internally.
 */
const buildConstraints = (state: FormState): Constraint[] => [
  { type: "custodia.allowed_assets.1", assets: ["ETH", "USDC"] },
  { type: "custodia.max_drawdown_pct.1", value: state.maxDrawdownPct },
  { type: "custodia.max_trade_usd.1", value: state.maxTradeUsd },
  { type: "custodia.allow_rebalance.1", value: state.allowRebalance },
];

// ─── Validation guard ─────────────────────────────────────────────────────────

/**
 * Validates the incoming prop with UISpecSchema.
 * Throws a hard ZodError if the spec contains disallowed component types or
 * out-of-bounds values — never falls back to defaults.
 */
const validateSpec = (raw: unknown): UISpec => UISpecSchema.parse(raw);

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        display: "block",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--custodia-soft)",
        marginBottom: "0.4rem",
      }}
    >
      {children}
    </label>
  );
}

function ValueBadge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-block",
        background: "var(--custodia-accent-dim)",
        border: "1px solid var(--custodia-accent-line)",
        borderRadius: 6,
        padding: "2px 10px",
        fontSize: 13,
        fontWeight: 700,
        color: "var(--custodia-accent)",
        minWidth: 54,
        textAlign: "center",
      }}
    >
      {children}
    </span>
  );
}

const fmtUsd = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

// ─── Main component ───────────────────────────────────────────────────────────

type MandateRendererProps = {
  /** Raw UISpec object from the agent — validated internally with Zod. */
  spec: unknown;
  /** ENS name under which the mandate will be published (e.g. "guard.alice.eth"). */
  ensName: string;
  /** Known agent address (set by the platform, never by the LLM). */
  agentAddress: Address;
  /** TTL for the mandate in seconds (default: 7 days). */
  ttlSeconds?: number;
  /** Called with the raw signature and computed mandate hash after the user signs. */
  onSigned?: (result: SignatureResult) => void;
  /** Called when the user explicitly revokes / dismisses the proposal. */
  onRevoke?: () => void;
};

export default function MandateRenderer({
  spec: rawSpec,
  ensName,
  agentAddress,
  ttlSeconds = 7 * 24 * 60 * 60,
  onSigned,
  onRevoke,
}: MandateRendererProps) {
  // ── 1. Validate the spec — hard error surfaces in the UI, not a console.warn ──
  let spec: UISpec;
  try {
    spec = validateSpec(rawSpec);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      <div
        role="alert"
        style={{
          background: "rgba(255, 107, 107, 0.08)",
          border: "1px solid rgba(255, 107, 107, 0.35)",
          borderRadius: 10,
          padding: "1rem 1.25rem",
          color: "var(--custodia-danger)",
          fontSize: 13,
          fontFamily: "monospace",
        }}
      >
        <strong>UISpec validation failed — proposal rejected.</strong>
        <pre style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap", opacity: 0.8 }}>{msg}</pre>
      </div>
    );
  }

  // ── 2. Local state ───────────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [form, dispatch] = useReducer(formReducer, spec, initFormState);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [status, setStatus] = useState<
    "idle" | "requesting_account" | "signing" | "signed" | "error"
  >("idle");
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [result, setResult] = useState<SignatureResult | null>(null);

  // ── 3. Approve handler ───────────────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const handleApprove = useCallback(async () => {
    setErrorMsg(null);

    try {
      // 3a. Request connected account.
      setStatus("requesting_account");
      const ethereum = getEthereum();
      const accounts = (await ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const owner = asAddress(accounts[0]);

      // 3b. Build EIP-712 message.
      setStatus("signing");
      const now = Math.floor(Date.now() / 1000);
      const taskId = globalThis.crypto.randomUUID().replace(/-/g, "").slice(0, 8);

      const constraints = buildConstraints(form);
      const cHash = constraintsHash(constraints);

      // 3c. Request wallet signature (eth_signTypedData_v4).
      //     BigInt serialised as string for JSON — wallet reconstructs internally.
      const typedDataPayload = JSON.stringify({
        domain: MANDATE_DOMAIN,
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
          ],
          ...MANDATE_TYPES,
        },
        primaryType: "Mandate",
        message: {
          kind: "custodia.mandate.task.1",
          taskId,
          owner,
          agent: agentAddress,
          ens: ensName,
          constraintsHash: cHash,
          iat: String(now),
          exp: String(now + ttlSeconds),
        },
      });

      const rawSig = (await ethereum.request({
        method: "eth_signTypedData_v4",
        params: [owner, typedDataPayload],
      })) as `0x${string}`;

      // 3d. Compute mandate hash: keccak256(signature).
      //     This is the value written to the ENS xyz.custodia.mandate record.
      const mandateHash = keccak256(toHex(rawSig));

      const sigResult: SignatureResult = { signature: rawSig, mandateHash };
      setResult(sigResult);
      setStatus("signed");
      onSigned?.(sigResult);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error during signing.";
      setErrorMsg(msg);
      setStatus("error");
    }
  }, [form, ensName, agentAddress, ttlSeconds, onSigned]);

  // ── 4. Derived display values ────────────────────────────────────────────────
  const usdcPct = 100 - form.ethPct;
  const allocation = spec.components.find((c) => c.type === "allocation_selector");
  const drawdown = spec.components.find((c) => c.type === "range_slider");
  const tradeSize = spec.components.find((c) => c.type === "amount_selector");
  const rebalance = spec.components.find((c) => c.type === "permission_toggle");

  const isDisabled = status === "requesting_account" || status === "signing" || status === "signed";

  // ── 5. Render ────────────────────────────────────────────────────────────────
  return (
    <section
      aria-labelledby="mandate-renderer-title"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid var(--custodia-accent-line)",
        borderRadius: 14,
        padding: "1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
      }}
    >
      {/* ── Header ── */}
      <div>
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--custodia-accent)",
            margin: "0 0 0.3rem",
          }}
        >
          Mandate proposal · PENDING SIGNATURE
        </p>
        <h2
          id="mandate-renderer-title"
          style={{ fontSize: 16, fontWeight: 700, color: "var(--custodia-text)", margin: 0 }}
        >
          {ensName}
        </h2>
        <p style={{ fontSize: 12, color: "var(--custodia-soft)", margin: "0.25rem 0 0" }}>
          {spec.rationale}
        </p>
      </div>

      {/* ── Dynamically rendered UISpec components ── */}
      <fieldset
        style={{
          border: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
        }}
        disabled={isDisabled}
      >
        <legend className="sr-only">Mandate parameters</legend>

        {/* allocation_selector ─────────────────────────────────────── */}
        {allocation?.type === "allocation_selector" && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.5rem",
              }}
            >
              <FieldLabel>ETH / USDC Allocation</FieldLabel>
              <ValueBadge>
                {form.ethPct}% ETH · {usdcPct}% USDC
              </ValueBadge>
            </div>
            <input
              id="allocation-eth-pct"
              type="range"
              min={0}
              max={100}
              step={5}
              value={form.ethPct}
              onChange={(e) =>
                dispatch({ type: "SET_ETH_PCT", value: Number(e.target.value) })
              }
              style={{ width: "100%", accentColor: "var(--custodia-accent)" }}
              aria-label="ETH allocation percentage"
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                color: "var(--custodia-soft)",
                marginTop: "0.2rem",
              }}
            >
              <span>0% ETH</span>
              <span>100% ETH</span>
            </div>
          </div>
        )}

        {/* range_slider (max_drawdown_pct) ─────────────────────────── */}
        {drawdown?.type === "range_slider" && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.5rem",
              }}
            >
              <FieldLabel>Max Drawdown Trigger</FieldLabel>
              <ValueBadge>{form.maxDrawdownPct}%</ValueBadge>
            </div>
            <input
              id="max-drawdown-pct"
              type="range"
              min={drawdown.min}
              max={drawdown.max}
              step={1}
              value={form.maxDrawdownPct}
              onChange={(e) =>
                dispatch({ type: "SET_DRAWDOWN", value: Number(e.target.value) })
              }
              style={{ width: "100%", accentColor: "var(--custodia-accent)" }}
              aria-label="Maximum drawdown percentage trigger"
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                color: "var(--custodia-soft)",
                marginTop: "0.2rem",
              }}
            >
              <span>{drawdown.min}% (conservative)</span>
              <span>{drawdown.max}% (aggressive)</span>
            </div>
          </div>
        )}

        {/* amount_selector (max_trade_usd) ─────────────────────────── */}
        {tradeSize?.type === "amount_selector" && (
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.5rem",
              }}
            >
              <FieldLabel>Max Capital per Rebalance Cycle</FieldLabel>
              <ValueBadge>{fmtUsd(form.maxTradeUsd)}</ValueBadge>
            </div>
            <input
              id="max-trade-usd"
              type="range"
              min={tradeSize.min}
              max={tradeSize.max}
              step={100}
              value={form.maxTradeUsd}
              onChange={(e) =>
                dispatch({ type: "SET_TRADE_USD", value: Number(e.target.value) })
              }
              style={{ width: "100%", accentColor: "var(--custodia-accent)" }}
              aria-label="Maximum trade size in USD"
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                color: "var(--custodia-soft)",
                marginTop: "0.2rem",
              }}
            >
              <span>{fmtUsd(tradeSize.min)}</span>
              <span>{fmtUsd(tradeSize.max)}</span>
            </div>
          </div>
        )}

        {/* permission_toggle (allow_rebalance) ─────────────────────── */}
        {rebalance?.type === "permission_toggle" && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "var(--custodia-accent-muted)",
              border: "1px solid var(--custodia-accent-line)",
              borderRadius: 8,
              padding: "0.75rem 1rem",
              gap: "1rem",
            }}
          >
            <div>
              <FieldLabel>Autonomous Rebalance Permission</FieldLabel>
              <p style={{ fontSize: 11, color: "var(--custodia-soft)", margin: 0 }}>
                {rebalance.consequence}
              </p>
            </div>
            {/* CSS toggle — no third-party library needed */}
            <label
              htmlFor="allow-rebalance-toggle"
              style={{
                position: "relative",
                display: "inline-block",
                width: 40,
                height: 22,
                flexShrink: 0,
              }}
            >
              <input
                id="allow-rebalance-toggle"
                type="checkbox"
                checked={form.allowRebalance}
                onChange={(e) =>
                  dispatch({ type: "SET_ALLOW_REBALANCE", value: e.target.checked })
                }
                style={{ opacity: 0, width: 0, height: 0, position: "absolute" }}
                aria-label="Allow autonomous rebalance"
              />
              <span
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 22,
                  background: form.allowRebalance
                    ? "var(--custodia-accent)"
                    : "var(--custodia-line)",
                  transition: "background 0.2s",
                  cursor: isDisabled ? "not-allowed" : "pointer",
                }}
              />
              <span
                style={{
                  position: "absolute",
                  top: 3,
                  left: form.allowRebalance ? 21 : 3,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "var(--custodia-text)",
                  transition: "left 0.2s",
                  pointerEvents: "none",
                }}
              />
            </label>
          </div>
        )}
      </fieldset>

      {/* ── Constraint preview (what will be signed) ── */}
      <div
        style={{
          background: "rgba(0,0,0,0.25)",
          borderRadius: 8,
          padding: "0.75rem 1rem",
          fontSize: 12,
          color: "var(--custodia-muted)",
          fontFamily: "monospace",
          lineHeight: 1.7,
        }}
      >
        <span
          style={{
            color: "var(--custodia-soft)",
            display: "block",
            marginBottom: "0.3rem",
          }}
        >
          {"// Constraints that will be signed (EIP-712)"}
        </span>
        {buildConstraints(form).map((c) => (
          <div key={c.type}>
            <span style={{ color: "var(--custodia-accent)" }}>{c.type}</span>:{" "}
            {"value" in c ? String(c.value) : c.assets.join(", ")}
          </div>
        ))}
        <div style={{ marginTop: "0.4rem" }}>
          <span style={{ color: "var(--custodia-soft)" }}>constraintsHash: </span>
          <span style={{ color: "var(--custodia-muted)", fontSize: 11 }}>
            {constraintsHash(buildConstraints(form)).slice(0, 20)}…
          </span>
        </div>
      </div>

      {/* ── Error message ── */}
      {status === "error" && errorMsg && (
        <div
          role="alert"
          style={{
            background: "rgba(255, 107, 107, 0.08)",
            border: "1px solid rgba(255, 107, 107, 0.28)",
            borderRadius: 8,
            padding: "0.6rem 1rem",
            fontSize: 12,
            color: "var(--custodia-danger)",
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* ── Signed result ── */}
      {status === "signed" && result && (
        <div
          role="status"
          style={{
            background: "var(--custodia-accent-muted)",
            border: "1px solid var(--custodia-accent-line)",
            borderRadius: 8,
            padding: "0.75rem 1rem",
            fontSize: 12,
            color: "var(--custodia-muted)",
            fontFamily: "monospace",
            lineHeight: 1.7,
          }}
        >
          <div style={{ color: "var(--custodia-accent)", fontWeight: 700, marginBottom: "0.3rem" }}>
            ✓ Mandate signed — awaiting policy engine
          </div>
          <div>
            <span style={{ color: "var(--custodia-soft)" }}>mandateHash: </span>
            {result.mandateHash.slice(0, 22)}…
          </div>
          <div
            style={{
              fontSize: 10,
              color: "var(--custodia-soft)",
              marginTop: "0.3rem",
            }}
          >
            keccak256(signature) · to be written to ENS record xyz.custodia.mandate
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          id="mandate-approve-btn"
          type="button"
          onClick={handleApprove}
          disabled={isDisabled}
          style={{
            flex: 1,
            padding: "0.7rem 1rem",
            borderRadius: 8,
            border: "none",
            background: isDisabled ? "var(--custodia-accent-dim)" : "var(--custodia-accent)",
            color: isDisabled ? "var(--custodia-soft)" : "var(--custodia-accent-ink)",
            fontWeight: 700,
            fontSize: 13,
            letterSpacing: "0.04em",
            cursor: isDisabled ? "not-allowed" : "pointer",
            transition: "opacity 0.2s",
          }}
        >
          {status === "requesting_account" && "Connecting wallet…"}
          {status === "signing" && "Waiting for signature…"}
          {status === "signed" && "✓ Signed"}
          {(status === "idle" || status === "error") && "Approve & Sign mandate"}
        </button>

        {onRevoke && status !== "signed" && (
          <button
            id="mandate-revoke-btn"
            type="button"
            onClick={onRevoke}
            disabled={isDisabled}
            style={{
              padding: "0.7rem 1.1rem",
              borderRadius: 8,
              border: "1px solid rgba(255, 107, 107, 0.3)",
              background: "transparent",
              color: "var(--custodia-danger)",
              fontWeight: 600,
              fontSize: 13,
              cursor: isDisabled ? "not-allowed" : "pointer",
            }}
          >
            Revoke
          </button>
        )}
      </div>

      {/* ── Authority disclaimer ── */}
      <p
        style={{
          fontSize: 10,
          color: "var(--custodia-soft)",
          margin: 0,
          lineHeight: 1.5,
          textAlign: "center",
        }}
      >
        CustodIA proposes · you authorise · the policy engine executes.
        No funds move without your explicit signature and policy validation.
      </p>
    </section>
  );
}
