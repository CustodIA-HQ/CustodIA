import { createHmac, timingSafeEqual } from "node:crypto";
import { tables } from "@custodia/db";
import { getParentName, makeOwnerName } from "@custodia/ens";
import { ownerDirectoryPath, publicAppOrigin } from "@custodia/ens/paths";
import { holdingsLine, NotImplementedError, wantsTextOnly } from "@custodia/schema";
import { and, eq } from "drizzle-orm";
import { enqueueJob } from "./jobs.js";
import { CLAIM_NUDGE, needsName, taskLinkUrl } from "./names.js";
import { type AnyDb, listEvents, loadRun } from "./runs.js";
import { getStoredUserLabel } from "./users.js";

/** Where a run's answer goes when it did not start in web chat. Stored on `runs.input.reply`. */
export type ChannelReply = { channel: "telegram" | "whatsapp"; chatId: string };

/**
 * A button under a chat message. `url` opens a page; `id` is sent back as if
 * the user typed it (Telegram callback / WhatsApp reply button), so every
 * button has a typed equivalent and the text alone stays sufficient.
 */
export type ChannelButton = { label: string; url?: string; id?: string };

/** Telegram: 64-byte callback data. WhatsApp: 3 reply buttons of ≤20 chars, or one URL button. */
const WHATSAPP_MAX_BUTTONS = 3;
const WHATSAPP_MAX_LABEL = 20;
const WHATSAPP_INTERACTIVE_MAX_BODY = 1_024;

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
  taskUrl: string | null = null,
): string => {
  if (run.status !== "done") return "The agent could not complete that request. Please retry.";
  const output = run.output as { rationale?: string; taskId?: string | null } | null;
  const parts = [output?.rationale?.trim() || summary.text || "Done."];
  if (summary.holdings) parts.push(summary.holdings);
  if (graphUrl) parts.push(`Graph: ${graphUrl}`);
  if (output?.taskId) {
    const link = taskUrl ?? `${origin}/task/${encodeURIComponent(output.taskId)}`;
    parts.push(`Review and sign the boundary on the web: ${link}`);
  }
  return parts.join("\n\n");
};

/** `/<label>.custodia.eth/wallet` for a claimed name, else the signed `/wallet?t=…` link. */
export async function walletViewUrl(
  db: AnyDb,
  ownerWallet: `0x${string}`,
  runId: string,
): Promise<string> {
  const origin = publicAppOrigin();
  const label = await getStoredUserLabel(db, ownerWallet).catch(() => null);
  if (label) return `${origin}${ownerDirectoryPath(makeOwnerName(label, getParentName()))}/wallet`;
  return `${origin}/wallet?t=${createWalletViewToken(runId)}`;
}

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
  // A wallet snapshot gets the graph page unless the user asked for text. Owners with a
  // claimed name get it under their ENS namespace; otherwise a signed, expiring link.
  const graphUrl =
    summary.snapshot && !wantsTextOnly(lastUser?.content ?? "")
      ? await walletViewUrl(db, run.ownerWallet as `0x${string}`, runId)
      : null;
  const taskId = (run.output as { taskId?: string | null } | null)?.taskId ?? null;
  // The task link carries a signed ticket: the chat already proved the wallet, so the page
  // opens with a web session and the owner can sign the mandate right there.
  const taskUrl = taskId ? taskLinkUrl(run.ownerWallet as `0x${string}`, taskId) : null;
  let text = channelReplyText(run, publicAppOrigin(), summary, graphUrl, taskUrl);
  // A wallet answer is where the identity shows: nudge until a name is claimed.
  if (summary.snapshot && (await needsName(db, run.ownerWallet as `0x${string}`))) {
    text += `\n\n${CLAIM_NUDGE}`;
  }
  const buttons: ChannelButton[] = [];
  if (graphUrl) buttons.push({ label: "Open graph", url: graphUrl });
  if (taskUrl) buttons.push({ label: "Review & sign", url: taskUrl });
  await queueChannelMessage(db, target, text, buttons);
}

/** Queue text for the channel a run came from; no-op for web runs. */
export async function queueChannelMessageForRun(
  db: AnyDb,
  runId: string,
  text: string,
  buttons: ChannelButton[] = [],
): Promise<void> {
  const run = await loadRun(db, runId);
  const target = run ? replyTarget(run.input) : null;
  if (target) await queueChannelMessage(db, target, text, buttons);
}

/** Queue text for every chat the owner paired (agent-initiated events have no originating run). */
export async function notifyOwner(
  db: AnyDb,
  ownerWallet: string,
  text: string,
  buttons: ChannelButton[] = [],
): Promise<void> {
  const bindings = await db
    .select()
    .from(tables.channelBindings)
    .where(eq(tables.channelBindings.ownerWallet, ownerWallet));
  for (const b of bindings) {
    if (b.channel === "telegram" || b.channel === "whatsapp") {
      await queueChannelMessage(db, { channel: b.channel, chatId: b.externalId }, text, buttons);
    }
  }
}

/** Queue text for a chat channel; the worker's notify.drain delivers it. */
export async function queueChannelMessage(
  db: AnyDb,
  target: ChannelReply,
  text: string,
  buttons: ChannelButton[] = [],
): Promise<void> {
  await db.insert(tables.outbox).values({
    channel: target.channel,
    target: target.chatId,
    payload: buttons.length ? { text, buttons } : { text },
  });
  await enqueueJob(db, { kind: "notify.drain", payload: {}, dedupeKey: "notify.drain" });
}

/** Inline keyboard: URL buttons open pages, callback buttons send their id back to the webhook. */
export const telegramKeyboard = (buttons: ChannelButton[]) =>
  buttons.length
    ? {
        inline_keyboard: [
          buttons.map((b) =>
            b.url
              ? { text: b.label, url: b.url }
              : { text: b.label, callback_data: (b.id ?? b.label).slice(0, 64) },
          ),
        ],
      }
    : undefined;

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  buttons: ChannelButton[] = [],
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new NotImplementedError("TELEGRAM_BOT_TOKEN (Telegram delivery)");
  const reply_markup = telegramKeyboard(buttons);
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, TELEGRAM_MAX_TEXT),
      ...(reply_markup ? { reply_markup } : {}),
    }),
  });
  const body = (await response.json().catch(() => null)) as { ok?: boolean; description?: string };
  if (!response.ok || body?.ok !== true) {
    throw new Error(`Telegram sendMessage failed: ${body?.description ?? response.status}`);
  }
}

/** Free-form text is allowed inside the 24 h window a user message opens — every reply here answers one. */
/**
 * The Cloud API message body: interactive reply buttons (≤3), a single URL
 * button (cta_url), or plain text. Buttons that do not fit the limits are
 * dropped — the text always carries the same information.
 */
export const whatsAppMessageBody = (to: string, text: string, buttons: ChannelButton[]) => {
  const body = text.slice(0, WHATSAPP_MAX_TEXT);
  const base = { messaging_product: "whatsapp", to };
  if (!buttons.length || body.length > WHATSAPP_INTERACTIVE_MAX_BODY) {
    return { ...base, type: "text", text: { body } };
  }
  const replies = buttons.filter((b) => !b.url).slice(0, WHATSAPP_MAX_BUTTONS);
  if (replies.length) {
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: replies.map((b) => ({
            type: "reply",
            reply: {
              id: (b.id ?? b.label).slice(0, 256),
              title: b.label.slice(0, WHATSAPP_MAX_LABEL),
            },
          })),
        },
      },
    };
  }
  const link = buttons.find((b) => b.url);
  if (link?.url) {
    return {
      ...base,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: body },
        action: {
          name: "cta_url",
          parameters: { display_text: link.label.slice(0, WHATSAPP_MAX_LABEL), url: link.url },
        },
      },
    };
  }
  return { ...base, type: "text", text: { body } };
};

export async function sendWhatsAppMessage(
  to: string,
  text: string,
  buttons: ChannelButton[] = [],
): Promise<void> {
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
      body: JSON.stringify(whatsAppMessageBody(to, text, buttons)),
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { message?: string } };
    throw new Error(`WhatsApp send failed: ${body?.error?.message ?? response.status}`);
  }
}
