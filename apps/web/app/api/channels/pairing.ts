import "../../env";

import { createHmac, timingSafeEqual } from "node:crypto";
import { NotImplementedError } from "@custodia/schema";
import { getAddress } from "viem";
import type { WebAddress } from "../identity";

export type PairingChannel = "telegram" | "whatsapp";

/**
 * Stateless pairing code: wallet (20 bytes) + expiry (uint32 seconds) +
 * 128-bit HMAC tag bound to the channel, base64url — 54 chars, inside
 * Telegram's 64-char start-parameter limit. Issued only to a signed web
 * session, so holding a valid code proves the wallet was paired on the web.
 */
export const PAIRING_TTL_SECONDS = 10 * 60;

const WALLET_BYTES = 20;
const EXPIRY_BYTES = 4;
const TAG_BYTES = 16;

const tagFor = (channel: PairingChannel, body: Buffer): Buffer => {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new NotImplementedError("SESSION_SECRET (channel pairing)");
  return createHmac("sha256", secret)
    .update(`${channel}-pair|`)
    .update(body)
    .digest()
    .subarray(0, TAG_BYTES);
};

export const createPairingCode = (
  channel: PairingChannel,
  wallet: WebAddress,
  now = Date.now(),
): { code: string; expiresAt: number } => {
  const expiresAt = Math.floor(now / 1_000) + PAIRING_TTL_SECONDS;
  const body = Buffer.alloc(WALLET_BYTES + EXPIRY_BYTES);
  Buffer.from(wallet.slice(2), "hex").copy(body, 0);
  body.writeUInt32BE(expiresAt, WALLET_BYTES);
  return {
    code: Buffer.concat([body, tagFor(channel, body)]).toString("base64url"),
    expiresAt: expiresAt * 1_000,
  };
};

/** The paired wallet, or null for a forged, malformed, expired or other-channel code. */
export const readPairingCode = (
  channel: PairingChannel,
  code: string,
  now = Date.now(),
): WebAddress | null => {
  const raw = Buffer.from(code, "base64url");
  if (raw.length !== WALLET_BYTES + EXPIRY_BYTES + TAG_BYTES) return null;
  const body = raw.subarray(0, WALLET_BYTES + EXPIRY_BYTES);
  if (!timingSafeEqual(raw.subarray(WALLET_BYTES + EXPIRY_BYTES), tagFor(channel, body))) {
    return null;
  }
  if (body.readUInt32BE(WALLET_BYTES) * 1_000 <= now) return null;
  return getAddress(`0x${body.subarray(0, WALLET_BYTES).toString("hex")}`) as WebAddress;
};

/**
 * Chat-first verification link. The bot hands an unpaired chat account a
 * short-lived URL; the page it opens has the wallet sign `connectMessage` and
 * the server binds that account to the recovered wallet. Stateless like the
 * pairing code: base64url(JSON body) + "." + HMAC tag bound to the channel.
 */
export const CONNECT_TTL_SECONDS = 15 * 60;

export type ConnectClaim = { channel: PairingChannel; externalId: string; expiresAt: number };

const connectTag = (body: string): string => {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new NotImplementedError("SESSION_SECRET (channel verification)");
  return createHmac("sha256", secret)
    .update("channel-connect|")
    .update(body)
    .digest()
    .subarray(0, TAG_BYTES)
    .toString("base64url");
};

export const createConnectToken = (
  channel: PairingChannel,
  externalId: string,
  now = Date.now(),
): { token: string; expiresAt: number } => {
  const expiresAt = (Math.floor(now / 1_000) + CONNECT_TTL_SECONDS) * 1_000;
  const body = Buffer.from(JSON.stringify({ c: channel, e: externalId, x: expiresAt })).toString(
    "base64url",
  );
  return { token: `${body}.${connectTag(body)}`, expiresAt };
};

/** The chat account a verification link was issued to, or null for a forged or expired link. */
export const readConnectToken = (token: string, now = Date.now()): ConnectClaim | null => {
  const [body, tag, extra] = token.split(".");
  if (!body || !tag || extra !== undefined) return null;
  const expected = Buffer.from(connectTag(body));
  const provided = Buffer.from(tag);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const { c, e, x } = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      c?: unknown;
      e?: unknown;
      x?: unknown;
    };
    if ((c !== "telegram" && c !== "whatsapp") || typeof e !== "string" || typeof x !== "number") {
      return null;
    }
    if (x <= now) return null;
    return { channel: c, externalId: e, expiresAt: x };
  } catch {
    return null;
  }
};

const CHANNEL_LABEL: Record<PairingChannel, string> = {
  telegram: "Telegram",
  whatsapp: "WhatsApp",
};

/** The exact text the wallet signs; rebuilt server-side from the token, never taken from the client. */
export const connectMessage = (claim: ConnectClaim, wallet: WebAddress): string =>
  [
    "CustodIA chat verification",
    "",
    `Wallet: ${wallet}`,
    `Channel: ${CHANNEL_LABEL[claim.channel]}`,
    `Account: ${claim.externalId}`,
    `Expires at: ${new Date(claim.expiresAt).toISOString()}`,
    "",
    `Sign to link this ${CHANNEL_LABEL[claim.channel]} account to your wallet.`,
    "This signature does not approve a transaction or move funds.",
  ].join("\n");

export const connectUrl = (channel: PairingChannel, externalId: string, origin: string): string =>
  `${origin}/connect?t=${createConnectToken(channel, externalId).token}`;

/** Where "back to the chat" goes after verifying: the bot or the business number. */
export const channelChatUrl = (channel: PairingChannel): string | null => {
  if (channel === "telegram") {
    const bot = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
    return bot ? `https://t.me/${bot}` : null;
  }
  const number = process.env.WHATSAPP_BUSINESS_NUMBER?.replace(/\D/g, "");
  return number ? `https://wa.me/${number}` : null;
};
