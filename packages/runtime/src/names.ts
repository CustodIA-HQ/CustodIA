import { createHmac, timingSafeEqual } from "node:crypto";
import { getParentName, loadEnsConfig, lookupOwnerRecord, parseClaimLabel } from "@custodia/ens";
import { publicAppOrigin } from "@custodia/ens/paths";
import { NotImplementedError } from "@custodia/schema";
import type { AnyDb } from "./runs.js";
import { getStoredUserLabel, isAutoLabel, isLabelTaken } from "./users.js";

export { isAutoLabel };

/** "is alice available?", "check alice.custodia.eth", "claim alice", "my name" … */
export type NameCommand =
  | { kind: "check"; label: string }
  | { kind: "claim"; label: string }
  | { kind: "release" }
  | { kind: "mine" };

const LABEL = "([a-z0-9][a-z0-9-]{1,62}(?:\\.custodia\\.eth)?)";

export const parseNameCommand = (message: string): NameCommand | null => {
  const t = message.trim().toLowerCase();
  let m = t.match(
    new RegExp(`^(?:claim|register|reclama|registra)\\s+(?:the\\s+name\\s+)?${LABEL}\\s*$`),
  );
  if (m?.[1]) return { kind: "claim", label: m[1] };
  m = t.match(
    new RegExp(
      `^(?:is|check|verify|está|esta)\\s+${LABEL}\\s+(?:available|free|taken|disponible|libre)\\??$`,
    ),
  );
  if (m?.[1]) return { kind: "check", label: m[1] };
  m = t.match(new RegExp(`^(?:check|availability of|is)\\s+(?:the\\s+name\\s+)?${LABEL}\\??$`));
  if (m?.[1] && !/^(eth|usdc|my|the)$/.test(m[1])) return { kind: "check", label: m[1] };
  if (/^(release|delete|remove|drop|libera|borra)\s+(my\s+)?(ens\s+)?name\s*$/.test(t)) {
    return { kind: "release" };
  }
  if (/^(my (ens )?name|what'?s my (ens )?name|which name do i have|mi nombre)\??$/.test(t))
    return { kind: "mine" };
  return null;
};

export interface NameCheck {
  ok: boolean;
  label: string | null;
  name: string | null;
  /** Human sentence for the chat. */
  text: string;
}

/** Same rules as GET /api/ens/available: syntax, our registry, then the Sepolia record. */
export async function checkName(
  db: AnyDb,
  wallet: `0x${string}`,
  input: string,
): Promise<NameCheck> {
  const parsed = parseClaimLabel(input, getParentName());
  if (!parsed.ok) return { ok: false, label: null, name: null, text: parsed.error };
  if (await isLabelTaken(db, parsed.label, wallet)) {
    return {
      ok: false,
      label: parsed.label,
      name: parsed.name,
      text: `${parsed.name} is already claimed by another wallet.`,
    };
  }
  let onchain: string | null = null;
  try {
    onchain = await lookupOwnerRecord(loadEnsConfig(), parsed.name);
  } catch {
    onchain = null;
  }
  if (onchain && onchain.toLowerCase() !== wallet.toLowerCase()) {
    return {
      ok: false,
      label: parsed.label,
      name: parsed.name,
      text: `${parsed.name} is already attached on Sepolia.`,
    };
  }
  const yours = Boolean(onchain);
  return {
    ok: true,
    label: parsed.label,
    name: parsed.name,
    text: yours ? `${parsed.name} is already yours.` : `${parsed.name} is available.`,
  };
}

/** The owner's current identity, as a sentence. */
export async function describeMyName(db: AnyDb, wallet: `0x${string}`): Promise<string> {
  const label = await getStoredUserLabel(db, wallet);
  if (!label)
    return 'You have no CustodIA name yet. Say "claim <name>" to pick one, e.g. "claim alice".';
  const name = `${label}.${getParentName()}`;
  const auto = /^wallet-[0-9a-f]{8}$/.test(label);
  return auto
    ? `Your current name is ${name} (auto-generated). Say "claim <name>" to pick a better one — e.g. "claim alice".`
    : `Your name is ${name}. Directory: ${publicAppOrigin()}/${encodeURIComponent(name)}`;
}

// ── Claim link: the wallet signs on the web, so the chat hands out a short-lived link ──

const CLAIM_TTL_MS = 15 * 60 * 1_000;
const TAG_BYTES = 16;

const tag = (body: string): string => {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret) throw new NotImplementedError("SESSION_SECRET (claim links)");
  return createHmac("sha256", secret)
    .update("claim|")
    .update(body)
    .digest()
    .subarray(0, TAG_BYTES)
    .toString("base64url");
};

export type ClaimTicket = { wallet: `0x${string}`; label: string; expiresAt: number };

export const createClaimToken = (
  wallet: `0x${string}`,
  label: string,
  now = Date.now(),
): string => {
  const body = Buffer.from(JSON.stringify({ w: wallet, l: label, x: now + CLAIM_TTL_MS })).toString(
    "base64url",
  );
  return `${body}.${tag(body)}`;
};

export const readClaimToken = (token: string, now = Date.now()): ClaimTicket | null => {
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  const expected = Buffer.from(tag(body));
  const provided = Buffer.from(sig);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
  try {
    const { w, l, x } = JSON.parse(Buffer.from(body, "base64url").toString()) as {
      w?: unknown;
      l?: unknown;
      x?: unknown;
    };
    if (typeof w !== "string" || typeof l !== "string" || typeof x !== "number" || x <= now)
      return null;
    return { wallet: w as `0x${string}`, label: l, expiresAt: x };
  } catch {
    return null;
  }
};

export const claimUrl = (wallet: `0x${string}`, label: string): string =>
  `${publicAppOrigin()}/claim?t=${createClaimToken(wallet, label)}`;

/** True until the wallet has claimed a name of its own. */
export const needsName = async (db: AnyDb, wallet: `0x${string}`): Promise<boolean> =>
  isAutoLabel(await getStoredUserLabel(db, wallet).catch(() => null));

export const CLAIM_NUDGE =
  'You don\'t have a CustodIA name yet — your tasks and wallet page are published under an ENS subname. Say "claim <name>" (e.g. "claim alice") to pick one, or "is <name> available?" to check first.';

export const releaseUrl = (wallet: `0x${string}`, label: string): string =>
  `${publicAppOrigin()}/release?t=${createClaimToken(wallet, label)}`;

/** "Your identity is rob.custodia.eth (on Sepolia)" — or the claim nudge. For greetings and verification. */
export async function describeIdentity(db: AnyDb, wallet: `0x${string}`): Promise<string> {
  const label = await getStoredUserLabel(db, wallet).catch(() => null);
  if (isAutoLabel(label) || !label) return CLAIM_NUDGE;
  const name = `${label}.${getParentName()}`;
  let onchain: string | null = null;
  try {
    onchain = await lookupOwnerRecord(loadEnsConfig(), name);
  } catch {
    onchain = null;
  }
  const attached = onchain?.toLowerCase() === wallet.toLowerCase();
  return attached
    ? `Your identity is ${name}, minted on Sepolia ENS. Profile: ${publicAppOrigin()}/${encodeURIComponent(name)}`
    : `Your identity ${name} is reserved and being attached on Sepolia ENS — I'll confirm with the transaction.`;
}

/** Plain greetings answered without the model: "hi", "hello", "hola" … */
export const isGreeting = (message: string): boolean =>
  /^(hi|hello|hey|hola|buenas|good (morning|afternoon|evening)|yo|sup)\b[!. ]*$/i.test(
    message.trim(),
  );
