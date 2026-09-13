import { createHmac, timingSafeEqual } from "node:crypto";
import { tables } from "@custodia/db";
import { publicAppOrigin } from "@custodia/ens/paths";
import { holdingsLine, NotImplementedError, wantsTextOnly } from "@custodia/schema";
import { and, eq } from "drizzle-orm";
import { enqueueJob } from "./jobs.js";
import { type AnyDb, listEvents, loadRun } from "./runs.js";

/** Where a run's answer goes when it did not start in web chat. Stored on `runs.input.reply`. */
export type ChannelReply = { channel: "telegram" | "whatsapp"; chatId: string };

const TELEGRAM_MAX_TEXT = 4_096;
const WHATSAPP_MAX_TEXT = 4_096;
/** Meta Graph API version for the WhatsApp Cloud API. */
const WHATSAPP_GRAPH_VERSION = "v23.0";

/** The wallet an external chat identity is paired with, or null when unpaired. */
export async function findChannelBinding(
  db: AnyDb,
  channel: ChannelReply["channel"],
  externalId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ ownerWallet: tables.channelBindings.ownerWallet })
    .from(tables.channelBindings)
    .where(
      and(
        eq(tables.channelBindings.channel, channel),
        eq(tables.channelBindings.externalId, externalId),
      ),
    )
    .limit(1);
  return row?.ownerWallet ?? null;
}

/** Pair (or re-pair) an external chat identity with a wallet proven on the web. */
export async function bindChannel(
  db: AnyDb,
  params: { channel: ChannelReply["channel"]; externalId: string; ownerWallet: string },
): Promise<void> {
  await db
    .insert(tables.channelBindings)
    .values(params)
    .onConflictDoUpdate({
      target: [tables.channelBindings.channel, tables.channelBindings.externalId],
      set: { ownerWallet: params.ownerWallet },
    });
}

const replyTarget = (input: unknown): ChannelReply | null => {
  const reply = (input as { reply?: Partial<ChannelReply> } | null)?.reply;
  return (reply?.channel === "telegram" || reply?.channel === "whatsapp") &&
    typeof reply.chatId === "string"
    ? { channel: reply.channel, chatId: reply.chatId }
    : null;
};

/** Plain-text stand-in for what web chat renders from the event stream (streamed prose, wallet card). */
export type RunSummary = { text: string; holdings: string | null; snapshot: WalletView | null };

/** What /wallet renders for a chat user: the run's portfolio snapshot priced by its market context. */
export type WalletView = {
  network: string;
  wallet: string;
  eth: string;
  usdc: string;
  weth?: string;
  scope?: string;
  block?: string;
  priceUsd?: number;
  hourly?: Array<{ ts: number; close: number }>;
};

const WALLET_VIEW_TTL_MS = 24 * 60 * 60 * 1_000;
const WALLET_VIEW_TAG_BYTES = 16;

const walletViewTag = (body: string): string => {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new NotImplementedError("SESSION_SECRET (wallet view links)");
  return createHmac("sha256", secret)
    .update("wallet-view|")
    .update(body)
    .digest()
    .subarray(0, WALLET_VIEW_TAG_BYTES)
    .toString("base64url");
};

/** Signed, expiring link to a run's wallet view; holding it is the only authorization the page needs. */
export const createWalletViewToken = (runId: string, now = Date.now()): string => {
  const body = Buffer.from(JSON.stringify({ r: runId, x: now + WALLET_VIEW_TTL_MS })).toString(
    "base64url",
  );
  return `${body}.${walletViewTag(body)}`;
};

/** The run a wallet view link points at, or null for a forged or expired link. */
export const readWalletViewToken = (token: string, now = Date.now()): string | null => {
  const [body, tag, extra] = token.split(".");
  if (!body || !tag || extra !== undefined) return null;
  const expected = Buffer.from(walletViewTag(body));
  const provided = Buffer.from(tag);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const { r, x } = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      r?: unknown;
      x?: unknown;
    };
    return typeof r === "string" && typeof x === "number" && x > now ? r : null;
  } catch {
    return null;
  }
};

/**
 * Holdings and research runs answer through streamed text and a wallet card,
 * not `output.rationale`; a chat only gets text, so rebuild it from the events.
 */
export const summarizeRunEvents = (
  events: Array<{ type: string; payload: unknown }>,
): RunSummary => {
  let text = "";
  let portfolio: {
    eth?: string;
    usdc?: string;
    weth?: string;
    chain?: string;
    owner?: string;
    block?: string;
    scope?: string;
  } | null = null;
  let priceUsd: number | null = null;
  let hourly: Array<{ ts: number; close: number }> | undefined;
  for (const event of events) {
    const payload = event.payload as {
      delta?: string;
      name?: string;
      output?: Record<string, unknown>;
    } | null;
    if (event.type === "text" && typeof payload?.delta === "string") text += payload.delta;
    if (event.type !== "tool" || !payload?.output) continue;
    if (payload.name === "read_portfolio") portfolio = payload.output;
    if (payload.name === "get_market_context" && typeof payload.output.priceUsd === "number") {
      priceUsd = payload.output.priceUsd;
      if (Array.isArray(payload.output.hourly)) hourly = payload.output.hourly;
    }
  }
  const holdings = portfolio ? holdingsLine(portfolio, priceUsd) : null;
  const snapshot: WalletView | null = portfolio
    ? {
        network: portfolio.chain ?? "Ethereum Sepolia testnet",
        wallet: portfolio.owner ?? "",
        eth: portfolio.eth ?? "0",
        usdc: portfolio.usdc ?? "0",
        weth: portfolio.weth,
        scope: portfolio.scope,
        block: portfolio.block,
        priceUsd: priceUsd ?? undefined,
        hourly,
      }
    : null;
  return { text: text.trim(), holdings, snapshot };
};

/**
 * Text + task link back to the channel. Steps that need a wallet (mandate,
 * revoke) stay on the web page — a chat can neither render the form nor sign.
 */
export const channelReplyText = (
  run: { status: string; output: unknown },
  origin = publicAppOrigin(),
  summary: RunSummary = { text: "", holdings: null, snapshot: null },
  graphUrl: string | null = null,
): string => {
  if (run.status !== "done") return "The agent could not complete that request. Please retry.";
  const output = run.output as { rationale?: string; taskId?: string | null } | null;
  const parts = [output?.rationale?.trim() || summary.text || "Done."];
  if (summary.holdings) parts.push(summary.holdings);
  if (graphUrl) parts.push(`Graph: ${graphUrl}`);
  if (output?.taskId) {
    const link = `${origin}/task/${encodeURIComponent(output.taskId)}`;
    parts.push(`Review and sign the boundary on the web: ${link}`);
  }
  return parts.join("\n\n");
};

/** After a run finishes, queue its answer for the channel it came from (no-op for web). */
export async function queueChannelReply(db: AnyDb, runId: string): Promise<void> {
  const run = await loadRun(db, runId);
  const target = run ? replyTarget(run.input) : null;
  if (!run || !target) return;
  const summary = summarizeRunEvents(await listEvents(db, runId));
  const lastUser = [
    ...((run.input as { messages?: Array<{ role: string; content: string }> }).messages ?? []),
  ]
    .reverse()
    .find((m) => m.role === "user");
  // A wallet snapshot gets the graph page unless the user asked for text.
  const graphUrl =
    summary.snapshot && !wantsTextOnly(lastUser?.content ?? "")
      ? `${publicAppOrigin()}/wallet?t=${createWalletViewToken(runId)}`
      : null;
  await queueChannelMessage(
    db,
    target,
    channelReplyText(run, publicAppOrigin(), summary, graphUrl),
  );
}

/** Queue text for the channel a run came from; no-op for web runs. */
export async function queueChannelMessageForRun(
  db: AnyDb,
  runId: string,
  text: string,
): Promise<void> {
  const run = await loadRun(db, runId);
  const target = run ? replyTarget(run.input) : null;
  if (target) await queueChannelMessage(db, target, text);
}

/** Queue text for every chat the owner paired (agent-initiated events have no originating run). */
export async function notifyOwner(db: AnyDb, ownerWallet: string, text: string): Promise<void> {
  const bindings = await db
    .select()
    .from(tables.channelBindings)
    .where(eq(tables.channelBindings.ownerWallet, ownerWallet));
  for (const b of bindings) {
    if (b.channel === "telegram" || b.channel === "whatsapp") {
      await queueChannelMessage(db, { channel: b.channel, chatId: b.externalId }, text);
    }
  }
}

/** Queue text for a chat channel; the worker's notify.drain delivers it. */
export async function queueChannelMessage(
  db: AnyDb,
  target: ChannelReply,
  text: string,
): Promise<void> {
  await db.insert(tables.outbox).values({
    channel: target.channel,
    target: target.chatId,
    payload: { text },
  });
  await enqueueJob(db, { kind: "notify.drain", payload: {}, dedupeKey: "notify.drain" });
}

export async function sendTelegramMessage(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new NotImplementedError("TELEGRAM_BOT_TOKEN (Telegram delivery)");
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: text.slice(0, TELEGRAM_MAX_TEXT) }),
  });
  const body = (await response.json().catch(() => null)) as { ok?: boolean; description?: string };
  if (!response.ok || body?.ok !== true) {
    throw new Error(`Telegram sendMessage failed: ${body?.description ?? response.status}`);
  }
}

/** Free-form text is allowed inside the 24 h window a user message opens — every reply here answers one. */
export async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) {
    throw new NotImplementedError(
      "WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID (WhatsApp delivery)",
    );
  }
  const response = await fetch(
    `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text.slice(0, WHATSAPP_MAX_TEXT) },
      }),
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } };
    throw new Error(`WhatsApp send failed: ${body?.error?.message ?? response.status}`);
  }
}
