import { tables } from "@custodia/db";
import { publicAppOrigin } from "@custodia/ens/paths";
import { NotImplementedError } from "@custodia/schema";
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
export type RunSummary = { text: string; holdings: string | null };

const fmt = (value: number, digits: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: digits });

/**
 * Holdings and research runs answer through streamed text and a wallet card,
 * not `output.rationale`; a chat only gets text, so rebuild it from the events.
 */
export const summarizeRunEvents = (
  events: Array<{ type: string; payload: unknown }>,
): RunSummary => {
  let text = "";
  let portfolio: { eth?: string; usdc?: string; weth?: string; chain?: string } | null = null;
  let priceUsd: number | null = null;
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
    }
  }
  let holdings: string | null = null;
  if (portfolio) {
    const eth = Number(portfolio.eth ?? 0);
    const usdc = Number(portfolio.usdc ?? 0);
    const weth = Number(portfolio.weth ?? 0);
    const ethPart =
      priceUsd !== null
        ? `${fmt(eth, 4)} ETH (~$${fmt(eth * priceUsd, 0)} at $${fmt(priceUsd, 0)})`
        : `${fmt(eth, 4)} ETH`;
    holdings = `Wallet on ${portfolio.chain ?? "Sepolia"}: ${ethPart}, ${fmt(usdc, 2)} USDC, ${fmt(weth, 4)} WETH. Testnet balances, no real value.`;
  }
  return { text: text.trim(), holdings };
};

/**
 * Text + task link back to the channel. Steps that need a wallet (mandate,
 * revoke) stay on the web page — a chat can neither render the form nor sign.
 */
export const channelReplyText = (
  run: { status: string; output: unknown },
  origin = publicAppOrigin(),
  summary: RunSummary = { text: "", holdings: null },
): string => {
  if (run.status !== "done") return "The agent could not complete that request. Please retry.";
  const output = run.output as { rationale?: string; taskId?: string | null } | null;
  const parts = [output?.rationale?.trim() || summary.text || "Done."];
  if (summary.holdings) parts.push(summary.holdings);
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
  await queueChannelMessage(db, target, channelReplyText(run, publicAppOrigin(), summary));
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
