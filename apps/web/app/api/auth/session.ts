import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
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

interface PendingChallenge {
  address: WebAddress;
  agent: WebAddress;
  conversationId: string;
  message: string;
  expiresAt: number;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

const pendingChallenges = new Map<string, PendingChallenge>();

const secret = (): string => {
  const value = process.env.SESSION_SECRET?.trim();
  if (!value) throw new NotImplementedError("SESSION_SECRET (conversation sessions)");
  return value;
};

const challengeKey = (conversationId: string, address: WebAddress): string =>
  `${conversationId}:${address.toLowerCase()}`;

const removeExpiredChallenges = (now: number): void => {
  for (const [key, challenge] of pendingChallenges) {
    if (challenge.expiresAt <= now) pendingChallenges.delete(key);
  }
};

export const createChallenge = (params: {
  address: WebAddress;
  agent: WebAddress;
  conversationId: string;
}): { message: string; expiresAt: number } => {
  const now = Date.now();
  removeExpiredChallenges(now);
  const expiresAt = now + CHALLENGE_TTL_MS;
  const nonce = randomBytes(16).toString("hex");
  const message = [
    "CustodIA conversation authorization",
    "",
    `Wallet: ${params.address}`,
    `Agent: ${params.agent}`,
    `Conversation: ${params.conversationId}`,
    `Nonce: ${nonce}`,
    `Issued at: ${new Date(now).toISOString()}`,
    `Expires at: ${new Date(expiresAt).toISOString()}`,
    "",
    "Sign this message to prove wallet control for this conversation.",
    "This signature authorizes chat access only; it does not approve a transaction.",
  ].join("\n");

  pendingChallenges.set(challengeKey(params.conversationId, params.address), {
    ...params,
    message,
    expiresAt,
  });
  return { message, expiresAt };
};

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
}): Promise<{ session: ConversationSession; token: string }> => {
  const address = normalizeAddress(params.address);
  const key = challengeKey(params.conversationId, address);
  const challenge = pendingChallenges.get(key);
  if (!challenge || challenge.expiresAt <= Date.now()) {
    pendingChallenges.delete(key);
    throw new AuthError("The conversation signature challenge is missing or expired.");
  }
  if (challenge.agent.toLowerCase() !== params.agent.toLowerCase()) {
    throw new AuthError("The conversation was challenged for a different agent.");
  }
  if (challenge.message !== params.message) {
    throw new AuthError("The signed message does not match the conversation challenge.");
  }

  const valid = await verifyMessage({
    address,
    message: params.message,
    signature: params.signature as `0x${string}`,
  });
  if (!valid) throw new AuthError("The wallet signature could not be verified.");

  pendingChallenges.delete(key);
  const now = Date.now();
  const session: ConversationSession = {
    address,
    agent: challenge.agent,
    conversationId: challenge.conversationId,
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
