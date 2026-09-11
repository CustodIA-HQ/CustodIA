"use client";

import {
  type Address,
  type Constraint,
  constraintsHash,
  MANDATE_DOMAIN,
  MANDATE_TYPES,
  type MarketContext,
  type UISpec,
} from "@custodia/schema";
import { type FormEvent, useRef, useState } from "react";
import { getAddress } from "viem";
import GuardChart from "./guard/guard-chart";

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type Proposal = {
  taskId: string;
  userLabel: string;
  parentName: string;
  ensName: string;
  owner: Address;
  agent: Address;
};

type ChatResponse = {
  error?: string;
  message?: string;
  reply?: string;
  content?: string;
  owner?: Address;
  agent?: Address;
  market?: MarketContext | null;
  uiSpec?: UISpec | null;
  proposal?: Proposal;
};

type PublishedGuard = {
  market: MarketContext;
  proposal: Proposal;
  uiSpec: UISpec;
  publishedName?: string;
};

type EthereumProvider = {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
};

const starterPrompts = ["Show my Sepolia portfolio", "Cap drawdown at 5%", "What can you protect?"];

const welcomeMessage: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Sign this conversation with your wallet, then tell me what you want your portfolio guard to protect. I’ll research ETH/USDC, fetch a paid risk context, and draw the live boundary before you publish it to ENS.",
};

const getEthereum = (): EthereumProvider => {
  const provider = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  if (!provider) throw new Error("Connect a browser wallet to sign this conversation.");
  return provider;
};

const conversationId = (ref: { current: string | null }): string => {
  if (!ref.current) ref.current = globalThis.crypto.randomUUID();
  return ref.current;
};

const asAddress = (value: unknown): Address => {
  if (typeof value !== "string") throw new Error("The wallet did not return an address.");
  return getAddress(value) as Address;
};

const shortAddress = (address: Address): string => `${address.slice(0, 6)}…${address.slice(-4)}`;

const formatUsd = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1_000 ? 0 : 2,
  }).format(value);

const chartFor = (spec: UISpec) =>
  spec.components.find((component) => component.type === "price_chart");

const constraintsFor = (spec: UISpec): Constraint[] => {
  const allocation = spec.components.find((component) => component.type === "allocation_selector");
  const drawdown = spec.components.find((component) => component.type === "range_slider");
  const tradeSize = spec.components.find((component) => component.type === "amount_selector");
  const rebalance = spec.components.find((component) => component.type === "permission_toggle");

  return [
    {
      type: "custodia.allowed_assets.1",
      assets: allocation?.type === "allocation_selector" ? [...allocation.assets] : ["ETH", "USDC"],
    },
    {
      type: "custodia.max_drawdown_pct.1",
      value: drawdown?.type === "range_slider" ? drawdown.max : 0,
    },
    {
      type: "custodia.max_trade_usd.1",
      value: tradeSize?.type === "amount_selector" ? tradeSize.max : 0,
    },
    {
      type: "custodia.allow_rebalance.1",
      value: rebalance?.type === "permission_toggle" ? rebalance.default : false,
    },
  ];
};

function GuardPreview({
  guard,
  isPublishing,
  onPublish,
}: {
  guard: PublishedGuard;
  isPublishing: boolean;
  onPublish: () => void;
}) {
  const chart = chartFor(guard.uiSpec);
  const allocation = guard.uiSpec.components.find(
    (component) => component.type === "allocation_selector",
  );
  const drawdown = guard.uiSpec.components.find((component) => component.type === "range_slider");
  const tradeSize = guard.uiSpec.components.find(
    (component) => component.type === "amount_selector",
  );
  const rebalance = guard.uiSpec.components.find(
    (component) => component.type === "permission_toggle",
  );
  const name = guard.publishedName ?? guard.proposal.ensName;

  return (
    <section className="guard-preview" aria-labelledby="guard-preview-title">
      <div className="guard-preview__header">
        <div>
          <p className="guard-card__eyebrow">Sepolia testnet guard proposal</p>
          <p>
            Test tokens have no monetary value. USD limits and charts use mainnet reference prices
            for simulation.
          </p>
          <h3 id="guard-preview-title">{name}</h3>
          <p className="guard-preview__subline">
            Bound to {shortAddress(guard.proposal.owner)} · agent{" "}
            {shortAddress(guard.proposal.agent)}
          </p>
        </div>
        {guard.publishedName && (
          <div className="guard-preview__links">
            <a
              className="guard-ens-link"
              href={`/guard/${encodeURIComponent(guard.publishedName)}`}
            >
              Open guard ↗
            </a>
            <a
              className="guard-ens-link"
              href={`https://sepolia.app.ens.domains/name/${encodeURIComponent(guard.publishedName)}`}
              rel="noreferrer"
              target="_blank"
            >
              ENS records ↗
            </a>
          </div>
        )}
      </div>

      {chart?.type === "price_chart" && <GuardChart market={guard.market} range={chart.range} />}

      <fieldset className="guard-boundaries">
        <legend className="sr-only">Guard boundaries</legend>
        {allocation?.type === "allocation_selector" && (
          <div className="guard-boundary">
            <span>Allocation</span>
            <strong>
              {allocation.assets
                .map((asset, index) => `${allocation.defaultPct[index]}% ${asset}`)
                .join(" / ")}
            </strong>
          </div>
        )}
        {drawdown?.type === "range_slider" && (
          <div className="guard-boundary">
            <span>Maximum drawdown</span>
            <strong>
              {drawdown.min}%–{drawdown.max}%
            </strong>
          </div>
        )}
        {tradeSize?.type === "amount_selector" && (
          <div className="guard-boundary">
            <span>Maximum trade</span>
            <strong>
              {formatUsd(tradeSize.min)}–{formatUsd(tradeSize.max)}
            </strong>
          </div>
        )}
        {rebalance?.type === "permission_toggle" && (
          <div className="guard-boundary">
            <span>Rebalancing</span>
            <strong>{rebalance.default ? "Enabled" : "Disabled by default"}</strong>
          </div>
        )}
      </fieldset>

      <div className="guard-preview__action">
        <p>
          Your wallet signature binds these constraints to this ENS subdomain. The operator then
          writes the chart, UI spec, owner, and agent delegation records.
        </p>
        <button
          disabled={isPublishing || Boolean(guard.publishedName)}
          onClick={onPublish}
          type="button"
        >
          {guard.publishedName
            ? "Guard published to ENS"
            : isPublishing
              ? "Publishing to ENS…"
              : "Sign agent & publish ENS guard"}
        </button>
      </div>
    </section>
  );
}

export default function ChatSection() {
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState("The agent could not complete that request.");
  const [failedPrompt, setFailedPrompt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isConversationSigned, setIsConversationSigned] = useState(false);
  const [walletAddress, setWalletAddress] = useState<Address | null>(null);
  const [guard, setGuard] = useState<PublishedGuard | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const reviewRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const conversationRef = useRef<string | null>(null);

  const authorizeConversation = async (): Promise<boolean> => {
    if (isConversationSigned) return true;
    setIsSigning(true);
    setError(null);
    try {
      const provider = getEthereum();
      const accounts = await provider.request({ method: "eth_requestAccounts" });
      const address = asAddress(Array.isArray(accounts) ? accounts[0] : undefined);
      const id = conversationId(conversationRef);
      const challengeResponse = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, conversationId: id }),
      });
      const challenge = (await challengeResponse.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };
      if (!challengeResponse.ok || !challenge.message) {
        throw new Error(challenge.error || "The agent could not create a conversation challenge.");
      }

      const signed = await provider.request({
        method: "personal_sign",
        params: [challenge.message, address],
      });
      if (typeof signed !== "string") throw new Error("The wallet did not return a signature.");

      const verifyResponse = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          address,
          conversationId: id,
          message: challenge.message,
          signature: signed,
        }),
      });
      const verified = (await verifyResponse.json().catch(() => ({}))) as { error?: string };
      if (!verifyResponse.ok)
        throw new Error(verified.error || "The wallet signature was rejected.");

      setWalletAddress(address);
      setIsConversationSigned(true);
      setErrorTitle("The agent could not complete that request.");
      return true;
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "The wallet signature was rejected.";
      setErrorTitle("Signature required for this conversation.");
      setError(message);
      setFailedPrompt(null);
      return false;
    } finally {
      setIsSigning(false);
    }
  };

  const publishGuard = async () => {
    if (!guard || !walletAddress || isPublishing) return;
    setIsPublishing(true);
    setError(null);
    try {
      const provider = getEthereum();
      const constraints = constraintsFor(guard.uiSpec);
      const iat = Math.floor(Date.now() / 1_000);
      const exp = iat + 30 * 24 * 60 * 60;
      const mandate = {
        kind: "custodia.mandate.task.1" as const,
        taskId: guard.proposal.taskId,
        owner: walletAddress,
        agent: guard.proposal.agent,
        ens: guard.proposal.ensName,
        constraints,
        iat,
        exp,
      };
      const typedMessage = {
        kind: mandate.kind,
        taskId: mandate.taskId,
        owner: mandate.owner,
        agent: mandate.agent,
        ens: mandate.ens,
        constraintsHash: constraintsHash(constraints),
        iat: String(iat),
        exp: String(exp),
      };
      const signature = await provider.request({
        method: "eth_signTypedData_v4",
        params: [
          walletAddress,
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
      if (typeof signature !== "string")
        throw new Error("The wallet did not return a typed-data signature.");

      const response = await fetch("/api/mandate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId(conversationRef),
          mandate,
          signature,
          market: guard.market,
          uiSpec: guard.uiSpec,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { name?: string; error?: string };
      if (!response.ok || !result.name)
        throw new Error(result.error || "The ENS guard could not be published.");
      setGuard((current) => (current ? { ...current, publishedName: result.name } : current));
    } catch (caught) {
      const message =
        caught instanceof Error ? caught.message : "The ENS guard could not be published.";
      setErrorTitle("ENS publication needs your attention.");
      setError(message);
    } finally {
      setIsPublishing(false);
    }
  };

  const sendPrompt = async (prompt: string) => {
    const content = prompt.trim();
    if (!content || isLoading || isSigning) return;

    if (!(await authorizeConversation())) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content,
    };

    setMessages((current) => [...current, userMessage]);
    setDraft("");
    setError(null);
    setErrorTitle("The agent could not complete that request.");
    setFailedPrompt(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          conversationId: conversationId(conversationRef),
          message: content,
          messages: [...messages, userMessage].map(({ role, content: text }) => ({
            role,
            content: text,
          })),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as ChatResponse;

      if (!response.ok) {
        if (response.status === 401) setIsConversationSigned(false);
        throw new Error(payload.error || "The agent is unavailable right now.");
      }

      const reply = payload.message || payload.reply || payload.content;
      if (!reply) throw new Error("The agent returned an empty response. Try again.");

      setMessages((current) => [
        ...current,
        { id: `assistant-${Date.now()}`, role: "assistant", content: reply },
      ]);
      if (payload.market && payload.uiSpec && payload.proposal) {
        setGuard({ market: payload.market, uiSpec: payload.uiSpec, proposal: payload.proposal });
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "The request failed. Try again.";
      setErrorTitle(
        message.startsWith("Not implemented:")
          ? "Agent setup is incomplete."
          : message.startsWith("Sign this conversation")
            ? "Signature required for this conversation."
            : "The agent could not complete that request.",
      );
      setError(message);
      setFailedPrompt(content);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendPrompt(draft);
  };

  return (
    <section className="chat-section" id="chat" aria-labelledby="chat-title">
      <div className="chat-section__intro">
        <div>
          <p className="chat-eyebrow">Conversation layer</p>
          <h2 id="chat-title">Start with intent. Leave with a boundary.</h2>
          <p className="chat-section__lede">
            Sign once for this conversation. CustodIA checks your Sepolia test ETH and USDC balances
            before proposing a simulated guard. Review charts and sign approvals in the separate
            guard view.
          </p>
        </div>
        <div className="chat-section__signal" role="status" aria-label="Agent API status">
          <span className="chat-status-dot" aria-hidden="true" />
          <span>Wallet-gated · agent route</span>
        </div>
      </div>

      <div className="chat-shell">
        <aside className="chat-context" aria-label="CustodIA workflow">
          <p className="chat-context__kicker">The guard loop</p>
          <ol>
            <li>
              <span>01</span>
              <div>
                <strong>Identify</strong>
                <small>Sign this conversation</small>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>Research</strong>
                <small>The Graph market context</small>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>Publish</strong>
                <small>Sign and write the ENS guard</small>
              </div>
            </li>
          </ol>
        </aside>

        <div className="chat-panel">
          <div className="chat-panel__header">
            <div>
              <p className="chat-panel__label">CustodIA agent</p>
              <p className="chat-panel__subline">Bounded finance, in plain language</p>
            </div>
            <span className="chat-panel__mode">Wallet gated</span>
          </div>

          <fieldset className="chat-identity">
            <legend className="sr-only">Conversation wallet identity</legend>
            <div>
              <p className="chat-identity__label">Conversation identity</p>
              <strong>
                {walletAddress
                  ? `${shortAddress(walletAddress)} · signed`
                  : "Wallet signature required"}
              </strong>
            </div>
            <button
              disabled={isConversationSigned || isSigning}
              onClick={() => void authorizeConversation()}
              type="button"
            >
              {isSigning
                ? "Waiting for signature…"
                : isConversationSigned
                  ? "Signed for this conversation"
                  : "Sign conversation"}
            </button>
          </fieldset>

          <div className="chat-messages" role="log" aria-live="polite" aria-busy={isLoading}>
            {messages.map((message) => (
              <div className={`chat-message chat-message--${message.role}`} key={message.id}>
                <span className="chat-message__role">
                  {message.role === "assistant" ? "CustodIA" : "You"}
                </span>
                <p>{message.content}</p>
              </div>
            ))}
            {isLoading && (
              <div className="chat-message chat-message--assistant chat-message--loading">
                <span className="chat-message__role">CustodIA</span>
                <p>Thinking through the guardrails…</p>
              </div>
            )}
          </div>

          {guard && (
            <>
              <button type="button" onClick={() => reviewRef.current?.showModal()}>
                Open guard review
              </button>
              <dialog
                ref={reviewRef}
                aria-label="Review and sign portfolio guard"
                style={{ maxWidth: "900px", width: "90vw", maxHeight: "90vh", overflow: "auto" }}
              >
                <button type="button" onClick={() => reviewRef.current?.close()}>
                  Close review
                </button>
                <GuardPreview
                  guard={guard}
                  isPublishing={isPublishing}
                  onPublish={() => void publishGuard()}
                />
              </dialog>
            </>
          )}

          {error && (
            <div className="chat-error" role="alert">
              <div>
                <strong>{errorTitle}</strong>
                <p>{error}</p>
              </div>
              {failedPrompt && (
                <button
                  className="chat-retry"
                  type="button"
                  onClick={() => {
                    setDraft(failedPrompt);
                    setError(null);
                    inputRef.current?.focus();
                  }}
                >
                  Use prompt again
                </button>
              )}
            </div>
          )}

          <fieldset className="chat-suggestions">
            <legend className="sr-only">Suggested prompts</legend>
            {starterPrompts.map((prompt) => (
              <button
                className="chat-suggestion"
                key={prompt}
                type="button"
                onClick={() => {
                  setDraft(prompt);
                  inputRef.current?.focus();
                }}
              >
                {prompt}
              </button>
            ))}
          </fieldset>

          <form className="chat-composer" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="custodia-chat-input">
              Describe your portfolio goal
            </label>
            <input
              ref={inputRef}
              autoComplete="off"
              enterKeyHint="send"
              id="custodia-chat-input"
              name="prompt"
              onChange={(event) => setDraft(event.target.value)}
              placeholder="e.g. Review my Sepolia holdings and suggest test guardrails"
              type="text"
              value={draft}
            />
            <button
              disabled={!draft.trim() || isLoading || isSigning}
              type="submit"
              aria-label="Send prompt"
            >
              {isLoading ? "Working…" : isConversationSigned ? "Send" : "Sign & send"}
            </button>
          </form>
          <p className="chat-footnote">
            The first signature proves wallet control for this conversation. The ENS publication
            asks for a separate typed mandate signature.
          </p>
        </div>
      </div>
    </section>
  );
}
