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
