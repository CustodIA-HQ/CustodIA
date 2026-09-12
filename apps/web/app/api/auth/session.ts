import "../../env";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { ChallengeStore } from "@custodia/db";
import { NotImplementedError } from "@custodia/schema";
import { verifyMessage } from "viem";
import { normalizeAddress, type WebAddress } from "../identity";

export const SESSION_COOKIE_NAME = "custodia_session";
export const CHALLENGE_TTL_MS = 10 * 60 * 1_000;
export const SESSION_TTL_SECONDS = 4 * 60 * 60;

export interface ConversationSession {
  address: WebAddress;
  agent: WebAddress;
  conversationId: string;
  issuedAt: number;
  expiresAt: number;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

const secret = (): string => {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value) throw new NotImplementedError("SESSION_SECRET (conversation sessions)");
  return value;
};

// Challenges are STATELESS: the nonce is an HMAC over the challenge fields, so
// any instance can verify a challenge any instance issued. An in-memory map
// breaks in Next dev (each route is its own module instance) and on serverless
// (each request may land on a different instance).
const challengeNonce = (fields: {
  address: WebAddress;
  agent: WebAddress;
  conversationId: string;
  issuedAt: number;
  expiresAt: number;
}): string =>
  createHmac("sha256", secret())
    .update(
      [
        "challenge",
        fields.address.toLowerCase(),
        fields.agent.toLowerCase(),
        fields.conversationId,
        String(fields.issuedAt),
        String(fields.expiresAt),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 32);

const challengeMessage = (fields: {
  address: WebAddress;
  agent: WebAddress;
  conversationId: string;
  issuedAt: number;
  expiresAt: number;
  nonce: string;
}): string =>
  [
    "CustodIA conversation authorization",
    "",
    `Wallet: ${fields.address}`,
    `Agent: ${fields.agent}`,
    `Conversation: ${fields.conversationId}`,
    `Nonce: ${fields.nonce}`,
    `Issued at: ${new Date(fields.issuedAt).toISOString()}`,
    `Expires at: ${new Date(fields.expiresAt).toISOString()}`,
    "",
    "Sign this message to prove wallet control for this conversation.",
    "This signature authorizes chat access only; it does not approve a transaction.",
  ].join("\n");

export const createChallenge = (params: {
  address: WebAddress;
  agent: WebAddress;
  conversationId: string;
}): { message: string; expiresAt: number } => {
  const issuedAt = Date.now();
  const expiresAt = issuedAt + CHALLENGE_TTL_MS;
  const nonce = challengeNonce({ ...params, issuedAt, expiresAt });
  return { message: challengeMessage({ ...params, issuedAt, expiresAt, nonce }), expiresAt };
};

const fieldFrom = (message: string, label: string): string | undefined =>
  message
    .split("\n")
    .find((line) => line.startsWith(`${label}: `))
    ?.slice(label.length + 2)
    .trim();

const encode = (value: string): string => Buffer.from(value, "utf8").toString("base64url");
const decode = (value: string): string => Buffer.from(value, "base64url").toString("utf8");

const signatureFor = (payload: string): string =>
  createHmac("sha256", secret()).update(payload).digest("base64url");

export const createSessionToken = (session: ConversationSession): string => {
  const payload = encode(JSON.stringify(session));
  return `${payload}.${signatureFor(payload)}`;
};

export const readSessionToken = (token: string | undefined): ConversationSession | null => {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = signatureFor(payload);
  const providedBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (
    providedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(providedBytes, expectedBytes)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(decode(payload)) as Partial<ConversationSession>;
    if (
      typeof parsed.address !== "string" ||
      typeof parsed.agent !== "string" ||
      typeof parsed.conversationId !== "string" ||
      typeof parsed.issuedAt !== "number" ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now()
    ) {
      return null;
    }
    return {
      address: normalizeAddress(parsed.address, "session address"),
      agent: normalizeAddress(parsed.agent, "session agent"),
      conversationId: parsed.conversationId,
      issuedAt: parsed.issuedAt,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
};

export const verifyChallenge = async (params: {
  address: string;
  agent: WebAddress;
  conversationId: string;
  message: string;
  signature: string;
  /** When given, the challenge nonce is consumed so a signed challenge is single-use. */
  store?: ChallengeStore;
}): Promise<{ session: ConversationSession; token: string }> => {
  const address = normalizeAddress(params.address);

  // Re-derive the challenge from the signed message and check every field
  // against what this server would have issued for this wallet/agent/conversation.
  const issuedAtRaw = fieldFrom(params.message, "Issued at");
  const expiresAtRaw = fieldFrom(params.message, "Expires at");
  const issuedAt = issuedAtRaw ? Date.parse(issuedAtRaw) : Number.NaN;
  const expiresAt = expiresAtRaw ? Date.parse(expiresAtRaw) : Number.NaN;
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    throw new AuthError("The signed message is not a CustodIA challenge.");
  }
  if (expiresAt <= Date.now()) {
    throw new AuthError("The conversation signature challenge is missing or expired.");
  }
  const expected = challengeMessage({
    address,
    agent: params.agent,
    conversationId: params.conversationId,
    issuedAt,
    expiresAt,
    nonce: challengeNonce({
      address,
      agent: params.agent,
      conversationId: params.conversationId,
      issuedAt,
      expiresAt,
    }),
  });
  const providedBytes = Buffer.from(params.message);
  const expectedBytes = Buffer.from(expected);
  if (
    providedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(providedBytes, expectedBytes)
  ) {
    throw new AuthError("The signed message does not match the conversation challenge.");
  }

  const valid = await verifyMessage({
    address,
    message: params.message,
    signature: params.signature as `0x${string}`,
  });
  if (!valid) throw new AuthError("The wallet signature could not be verified.");

  const nonce = fieldFrom(params.message, "Nonce");
  if (params.store && nonce) {
    const first = await params.store.consume(nonce, {
      conversationId: params.conversationId,
      address,
    });
    if (!first) throw new AuthError("This challenge has already been used — request a new one.");
  }

  const now = Date.now();
  const session: ConversationSession = {
    address,
    agent: params.agent,
    conversationId: params.conversationId,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_SECONDS * 1_000,
  };
  return { session, token: createSessionToken(session) };
};

const cookieValue = (header: string | null): string | undefined => {
  const entry = header
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE_NAME}=`));
  return entry?.slice(SESSION_COOKIE_NAME.length + 1);
};

export const sessionForRequest = (
  request: Request,
  conversationId: string,
): ConversationSession | null => {
  const session = readSessionToken(cookieValue(request.headers.get("cookie")));
  return session?.conversationId === conversationId ? session : null;
};
