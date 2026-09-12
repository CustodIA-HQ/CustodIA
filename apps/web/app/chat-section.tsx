"use client";

import { ownerDirectoryPath, taskDirectoryPath, taskSlug } from "@custodia/ens/paths";
import {
  type Address,
  type Constraint,
  constraintsHash,
  MANDATE_DOMAIN,
  MANDATE_TYPES,
  type MarketContext,
  type UISpec,
} from "@custodia/schema";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { getAddress } from "viem";
import { BalanceCard, type WalletSnapshot } from "./components/balance-card";
import { EnsClaimForm } from "./components/ens-claim-form";
import { GeneratedUx } from "./components/generated-ux";
import { QuickOptions } from "./components/quick-options";
import GuardChart from "./guard/guard-chart";
import { useRun } from "./use-run";

type Message = {
  id: string;
  role: "assistant" | "user";
  content: string;
  kind?: "text" | "snapshot" | "options" | "market";
  meta?: unknown;
};

type Proposal = {
  taskId: string;
  userLabel: string;
  parentName: string;
  ensName: string;
  owner: Address;
  agent: Address;
  template?: string;
};

type ChatResponse = {
  error?: string;
  runId?: string;
  created?: boolean;
};

type ProposalResponse = {
  error?: string;
  id?: string;
  market?: MarketContext;
  uiSpec?: UISpec;
  proposal?: Proposal;
};

type PublishedGuard = {
  proposalId: string;
  market: MarketContext;
  proposal: Proposal;
  uiSpec: UISpec;
  publishedName?: string;
};

const RUN_STORAGE_KEY = "custodia:runId";

type EthereumProvider = {
  request(args: { method: string; params?: readonly unknown[] }): Promise<unknown>;
};

const starterPrompts = [
  "What is ETH doing today?",
  "Show my Sepolia portfolio",
  "Protect me if ETH drops more than 15%",
  "Buy 500 USDC of ETH",
];

const welcomeMessage: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Sign this conversation, then ask what ETH is doing, show holdings, or set a protection boundary. Market questions stay in chat. A signed guard is the only thing that becomes an ENS task.",
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

function parseReply(reply: string): { body: string; choices: string[] } {
  const optionsMatch = reply.match(/(?:\n|^)Options:\s*(.+?)(?=\n|$)/is);
  if (!optionsMatch) return { body: reply, choices: [] };
  const raw = (optionsMatch[1] ?? "").trim();
  const choices = raw
    .split(/[,|]/)
    .map((s) => s.trim().replace(/^[-*]\s*/, ""))
    .filter(Boolean);
  const body = reply.slice(0, optionsMatch.index ?? 0).trim();
  return { body, choices };
}

function isHoldingsDump(text: string): boolean {
  return /wallet snapshot/i.test(text) && /ETH/i.test(text) && /USDC/i.test(text);
}

function snapshotFromPortfolio(
  portfolio: {
    chain?: string;
    owner?: string;
    block?: string;
    eth?: string;
    usdc?: string;
    scope?: string;
  },
  wallet: Address | null,
  market?: { priceUsd?: number; hourly?: Array<{ ts: number; close: number }> },
): Message {
  return {
    id: "snapshot",
    role: "assistant",
    content: "",
    kind: "snapshot",
    meta: {
      network: portfolio.chain ?? "Ethereum Sepolia testnet",
      wallet: wallet ?? portfolio.owner ?? "Unknown",
      eth: portfolio.eth ?? "0",
      usdc: portfolio.usdc ?? "0",
      block: portfolio.block,
      scope: portfolio.scope,
      priceUsd: market?.priceUsd,
      hourly: market?.hourly,
    } satisfies WalletSnapshot,
  };
}

const constraintsFor = (spec: UISpec): Constraint[] => {
  const allocation = spec.components.find((component) => component.type === "allocation_selector");
  const drawdown = spec.components.find((component) => component.type === "range_slider");
  const tradeSize = spec.components.find((component) => component.type === "amount_selector");
  const rebalance = spec.components.find((component) => component.type === "permission_toggle");
  const knobs = spec.components.find((component) => component.type === "protection_knobs");
  const preview = spec.components.find((component) => component.type === "execution_preview");
  const leverage = spec.components.find((component) => component.type === "leverage_control");
  const health = spec.components.find((component) => component.type === "health_meter");
  const constraints: Constraint[] = [
    {
      type: "custodia.allowed_assets.1",
      assets: allocation?.type === "allocation_selector" ? [...allocation.assets] : ["ETH", "USDC"],
    },
  ];
  if (drawdown?.type === "range_slider") {
    constraints.push({ type: "custodia.max_drawdown_pct.1", value: drawdown.max });
  }
  if (tradeSize?.type === "amount_selector") {
    constraints.push({ type: "custodia.max_trade_usd.1", value: tradeSize.max });
  }
  if (rebalance?.type === "permission_toggle") {
    constraints.push({ type: "custodia.allow_rebalance.1", value: rebalance.default });
  }
  if (knobs?.type === "protection_knobs") {
    constraints.push(
      { type: "custodia.deductible_pct.1", value: knobs.deductiblePct },
      { type: "custodia.duration_days.1", value: knobs.durationDays },
      { type: "custodia.max_premium_usd.1", value: knobs.budgetUsd },
    );
  }
  if (preview?.type === "execution_preview") {
    constraints.push(
      { type: "custodia.max_trade_usd.1", value: preview.notionalUsd },
      { type: "custodia.max_slippage_bps.1", value: preview.slippageBps },
    );
  }
  if (leverage?.type === "leverage_control") {
    constraints.push(
      { type: "custodia.max_leverage.1", value: leverage.enabled ? leverage.maxLeverage : 1 },
      { type: "custodia.require_stop.1", value: leverage.stopRequired },
    );
  }
  if (health?.type === "health_meter") {
    constraints.push({ type: "custodia.min_health_factor.1", value: health.threshold });
  }
  return constraints;
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
  const name = guard.publishedName ?? guard.proposal.ensName;
  const ownerName = `${guard.proposal.userLabel}.${guard.proposal.parentName}`;
  const template = guard.proposal.template ?? "portfolio_guard";
  const generatedPath = taskDirectoryPath(ownerName, guard.proposal.taskId, template);

  return (
    <section className="guard-preview" aria-labelledby="guard-preview-title">
      <div className="guard-preview__header">
        <div>
          <p className="guard-card__eyebrow">Sepolia testnet generated UX</p>
          <p>
            Test tokens have no monetary value. USD limits and charts use mainnet reference prices
            for simulation.
          </p>
          <h3 id="guard-preview-title">{name}</h3>
          <p className="guard-preview__subline">
            {ownerName}/{guard.proposal.taskId}/{taskSlug(template)} · bound to{" "}
            {shortAddress(guard.proposal.owner)} · agent {shortAddress(guard.proposal.agent)}
          </p>
        </div>
        <div className="guard-preview__links">
          <a className="guard-ens-link" href={generatedPath}>
            Open generated UX ↗
          </a>
          <a className="guard-ens-link" href={`/task/${encodeURIComponent(guard.proposal.taskId)}`}>
            Open task review ↗
          </a>
          {guard.publishedName && (
            <a
              className="guard-ens-link"
              href={`https://sepolia.app.ens.domains/name/${encodeURIComponent(guard.publishedName)}`}
              rel="noreferrer"
              target="_blank"
            >
              ENS records ↗
            </a>
          )}
        </div>
      </div>

      <GeneratedUx spec={guard.uiSpec} market={guard.market} />

      <div className="guard-preview__action">
        <p>
          Your wallet signature binds these constraints to this ENS subdomain. The operator then
          writes the chart, UI spec, owner, agent, and directory <code>url</code> records.
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

function MessageCard({
  message,
  onSelect,
}: {
  message: Message;
  onSelect: (choice: string) => void;
}) {
  const isUser = message.role === "user";

  if (message.kind === "snapshot") {
    const snapshot = message.meta as WalletSnapshot;
    return (
      <div className={`chat-message chat-message--${message.role} chat-message--snapshot`}>
        <span className="chat-message__role">{isUser ? "You" : "CustodIA"}</span>
        <BalanceCard {...snapshot} />
      </div>
    );
  }

  if (message.kind === "market") {
    const market = message.meta as MarketContext;
    return (
      <div className={`chat-message chat-message--${message.role} chat-message--snapshot`}>
        <span className="chat-message__role">{isUser ? "You" : "CustodIA"}</span>
        {message.content && <p>{message.content}</p>}
        <GuardChart market={market} range="24h" />
      </div>
    );
  }

  if (message.kind === "options") {
    const choices = (message.meta as string[]) ?? [];
    return (
      <div className="chat-message chat-message--assistant">
        <span className="chat-message__role">CustodIA</span>
        {message.content && <p>{message.content}</p>}
        <QuickOptions choices={choices} onSelect={onSelect} />
      </div>
    );
  }

  return (
    <div className={`chat-message chat-message--${message.role}`}>
      <span className="chat-message__role">{isUser ? "You" : "CustodIA"}</span>
      <p>{message.content}</p>
    </div>
  );
}

export default function ChatSection({ fullPage = false }: { fullPage?: boolean } = {}) {
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorTitle, setErrorTitle] = useState("The agent could not complete that request.");
  const [failedPrompt, setFailedPrompt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isConversationSigned, setIsConversationSigned] = useState(false);
  const [walletAddress, setWalletAddress] = useState<Address | null>(null);
  const [ensName, setEnsName] = useState<string | null>(null);
  const [ensAttached, setEnsAttached] = useState(false);
  const [ensParent, setEnsParent] = useState("custodia.eth");
  const [guard, setGuard] = useState<PublishedGuard | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  // The run id survives reloads: progress is re-read from /api/runs/:id/events.
  const [runId, setRunId] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.sessionStorage.getItem(RUN_STORAGE_KEY),
  );
  const run = useRun(runId);
  const handledRunRef = useRef<string | null>(null);

  useEffect(() => {
    if (!runId || handledRunRef.current === runId) return;
    if (run.status === "failed") {
      handledRunRef.current = runId;
      window.sessionStorage.removeItem(RUN_STORAGE_KEY);
      setErrorTitle("The agent could not complete that request.");
      setError(run.error ?? "The run failed.");
      return;
    }
    if (run.portfolio) {
      const snapshot = snapshotFromPortfolio(run.portfolio, walletAddress, run.market);
      const nextMeta = snapshot.meta as WalletSnapshot;
      setMessages((current) => {
        const existing = current.findIndex((message) => message.kind === "snapshot");
        if (existing >= 0) {
          const prev = current[existing]?.meta as WalletSnapshot | undefined;
          if (
            prev?.eth === nextMeta.eth &&
            prev.usdc === nextMeta.usdc &&
            prev.priceUsd === nextMeta.priceUsd &&
            prev.hourly?.length === nextMeta.hourly?.length
          ) {
            return current;
          }
          const next = [...current];
          next[existing] = { ...snapshot, id: current[existing]?.id ?? snapshot.id };
          return next;
        }
        return [...current, snapshot];
      });
    }

    if (run.status !== "done" || !run.result) return;
    handledRunRef.current = runId;
    window.sessionStorage.removeItem(RUN_STORAGE_KEY);
    const { proposalId, rationale } = run.result;
    const reply = run.text.trim() || rationale;

    const additions: Message[] = [];
    const now = Date.now();

    const { body, choices } = parseReply(reply);
    if (body && !isHoldingsDump(body)) {
      additions.push({ id: `assistant-${now}`, role: "assistant", content: body });
    }
    if (choices.length) {
      additions.push({
        id: `options-${now}`,
        role: "assistant",
        content: "",
        kind: "options",
        meta: choices,
      });
    }

    if (
      !proposalId &&
      run.market?.hourly &&
      run.market.hourly.length >= 24 &&
      typeof run.market.priceUsd === "number"
    ) {
      additions.push({
        id: `market-${now}`,
        role: "assistant",
        content: "",
        kind: "market",
        meta: run.market,
      });
    }

    if (additions.length) {
      setMessages((current) => [...current, ...additions]);
    }

    // No proposal: research or an explanation. Nothing is published to ENS.
    if (!proposalId) return;
    void (async () => {
      const response = await fetch(`/api/proposals/${proposalId}`);
      const payload = (await response.json().catch(() => ({}))) as ProposalResponse;
      if (!response.ok || !payload.market || !payload.uiSpec || !payload.proposal) {
        setErrorTitle("The proposal could not be loaded.");
        setError(payload.error || "Reload the page and try again.");
        return;
      }
      setGuard({
        proposalId,
        market: payload.market,
        uiSpec: payload.uiSpec,
        proposal: payload.proposal,
      });
    })();
  }, [
    runId,
    run.status,
    run.result,
    run.text,
    run.error,
    run.portfolio,
    run.market,
    walletAddress,
  ]);
  const reviewRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const conversationRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const showStarters = messages.length === 1;

  const scrollKey = `${messages.length}:${run.stageLabel}:${error ?? ""}`;
  useEffect(() => {
    void scrollKey;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    messagesEndRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
  }, [scrollKey]);

  useEffect(() => {
    if (!isConversationSigned) return;
    let stop = false;
    const pull = async () => {
      const response = await fetch("/api/identity");
      const payload = (await response.json().catch(() => ({}))) as {
        ensName?: string | null;
        attached?: boolean;
        needsEnsClaim?: boolean;
        parentName?: string;
      };
      if (stop || !response.ok) return;
      if (payload.parentName) setEnsParent(payload.parentName);
      setEnsName(payload.ensName ?? null);
      setEnsAttached(Boolean(payload.attached));
      if (payload.ensName && !payload.attached && !stop) {
        window.setTimeout(() => void pull(), 2500);
      }
    };
    void pull();
    return () => {
      stop = true;
    };
  }, [isConversationSigned]);

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
      const verified = (await verifyResponse.json().catch(() => ({}))) as {
        error?: string;
        ensName?: string;
      };
      if (!verifyResponse.ok)
        throw new Error(verified.error || "The wallet signature was rejected.");

      setWalletAddress(address);
      setIsConversationSigned(true);
      if (verified.ensName) setEnsName(verified.ensName);
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
          proposalId: guard.proposalId,
          mandate,
          signature,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as {
        ensName?: string;
        error?: string;
      };
      if (!response.ok || !result.ensName)
        throw new Error(result.error || "The task could not be authorized.");
      // The worker publishes to ENS; the guard page shows the live status.
      setGuard((current) => (current ? { ...current, publishedName: result.ensName } : current));
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
    if (!ensName) {
      setErrorTitle("Claim your ENS name first.");
      setError(
        "Pick an available name, sign the claim, and wait until it is minted. Tasks are published as subnames of that identity.",
      );
      return;
    }

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
          // Idempotency key: a retry of this exact message reuses the same run.
          clientRequestId: crypto.randomUUID(),
          message: content,
          messages: [...messages, userMessage]
            .filter((entry) => entry.content.trim().length > 0)
            .map(({ role, content: text }) => ({
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

      if (!payload.runId) throw new Error("The agent did not accept the request. Try again.");
      window.sessionStorage.setItem(RUN_STORAGE_KEY, payload.runId);
      handledRunRef.current = null;
      setRunId(payload.runId);
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
    <section
      className={`chat-section ${fullPage ? "chat-section--page" : ""}`}
      aria-label={fullPage ? "CustodIA chat" : "Conversation layer"}
    >
      {!fullPage && (
        <div className="chat-section__intro">
          <div>
            <p className="chat-eyebrow">Conversation layer</p>
            <h2 id="chat-title">Start with intent. Leave with a boundary.</h2>
            <p className="chat-section__lede">
              Sign once for this conversation. CustodIA checks your Sepolia test ETH and USDC
              balances before proposing a simulated guard. Review charts and sign approvals in the
              separate guard view.
            </p>
          </div>
          <div className="chat-section__signal" role="status" aria-label="Agent API status">
            <span className="chat-status-dot" aria-hidden="true" />
            <span>Wallet-gated · agent route</span>
          </div>
        </div>
      )}

      <div className={fullPage ? "chat-shell chat-shell--page" : "chat-shell"}>
        {!fullPage && (
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
        )}

        <div className="chat-panel">
          <div className="chat-panel__header">
            <div>
              <p className="chat-panel__label">CustodIA agent</p>
              {fullPage ? (
                <ol className="chat-loop-strip" aria-label="Guard loop">
                  <li>Identify</li>
                  <li>Research</li>
                  <li>Publish</li>
                </ol>
              ) : (
                <p className="chat-panel__subline">Bounded finance, in plain language</p>
              )}
            </div>
            {fullPage ? (
              <fieldset className="chat-identity chat-identity--inline">
                <legend className="sr-only">Conversation wallet identity</legend>
                <div>
                  <p className="chat-identity__label">Conversation identity</p>
                  <strong>
                    {walletAddress
                      ? `${shortAddress(walletAddress)} · signed`
                      : "Wallet signature required"}
                  </strong>
                  {ensName && (
                    <a className="chat-identity__ens" href={ownerDirectoryPath(ensName)}>
                      {ensName}
                      {ensAttached ? "" : " · publishing"}
                    </a>
                  )}
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
            ) : (
              <span className="chat-panel__mode">Wallet gated</span>
            )}
          </div>

          {!fullPage && (
            <fieldset className="chat-identity">
              <legend className="sr-only">Conversation wallet identity</legend>
              <div>
                <p className="chat-identity__label">Conversation identity</p>
                <strong>
                  {walletAddress
                    ? `${shortAddress(walletAddress)} · signed`
                    : "Wallet signature required"}
                </strong>
                {ensName && (
                  <a className="chat-identity__ens" href={ownerDirectoryPath(ensName)}>
                    {ensName}
                    {ensAttached ? "" : " · publishing"}
                  </a>
                )}
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
          )}

          <div className="chat-messages" role="log" aria-live="polite" aria-busy={isLoading}>
            {messages.map((message) => (
              <MessageCard
                key={message.id}
                message={message}
                onSelect={(choice) => void sendPrompt(choice)}
              />
            ))}
            {(isLoading || (runId && run.status !== "done" && run.status !== "failed")) && (
              <article
                className="chat-message chat-message--assistant chat-progress"
                aria-live="polite"
              >
                <p>
                  <strong>{isLoading ? "Queuing your request…" : run.stageLabel}</strong>
                  {!isLoading && run.events.length > 0 && (
                    <small> · {run.events.length} events</small>
                  )}
                </p>
              </article>
            )}

            <div ref={messagesEndRef} />
          </div>

          {guard && (
            <>
              <button
                className="chat-review-open"
                type="button"
                onClick={() => reviewRef.current?.showModal()}
              >
                Open guard review
              </button>
              <dialog
                ref={reviewRef}
                className="chat-review-dialog"
                aria-label="Review and sign portfolio guard"
              >
                <button
                  className="chat-review-close"
                  type="button"
                  onClick={() => reviewRef.current?.close()}
                >
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

          {isConversationSigned && walletAddress && !ensName ? (
            <EnsClaimForm
              parentName={ensParent}
              wallet={walletAddress}
              onClaimed={(name) => {
                setEnsName(name);
                setEnsAttached(false);
              }}
            />
          ) : (
            <div className="chat-dock">
              {showStarters && (
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
              )}

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
                The first signature proves wallet control for this conversation. Tasks publish under
                your minted ENS name. Mandate signing is a separate typed signature.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
