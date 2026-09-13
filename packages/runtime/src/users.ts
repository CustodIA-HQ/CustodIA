import { tables } from "@custodia/db";
import { and, eq, ne, sql } from "drizzle-orm";
import type { AnyDb } from "./runs.js";

/** Auto-generated fallback labels look like wallet-9e15a220; a real identity is anything else. */
export const isAutoLabel = (label: string | null): boolean =>
  !label || /^wallet-[0-9a-f]{8}$/.test(label);

export async function getStoredUserLabel(db: AnyDb, wallet: `0x${string}`): Promise<string | null> {
  const key = wallet.toLowerCase();
  const [existing] = await db
    .select({ ensLabel: tables.users.ensLabel })
    .from(tables.users)
    .where(eq(tables.users.wallet, key))
    .limit(1);
  return existing?.ensLabel ?? null;
}

/**
 * Returns the frozen ENS label. Does not invent a wallet-* name — the owner
 * must claim a label first so tasks nest under the same minted identity.
 */
export async function getOrCreateUserLabel(db: AnyDb, wallet: `0x${string}`): Promise<string> {
  const stored = await getStoredUserLabel(db, wallet);
  if (stored) return stored;
  throw new Error("ENS name not claimed. Pick and mint a name under the parent first.");
}

export async function isLabelTaken(
  db: AnyDb,
  label: string,
  exceptWallet?: `0x${string}`,
): Promise<boolean> {
  const rows = exceptWallet
    ? await db
        .select({ wallet: tables.users.wallet })
        .from(tables.users)
        .where(
          and(
            eq(tables.users.ensLabel, label),
            ne(tables.users.wallet, exceptWallet.toLowerCase()),
          ),
        )
        .limit(1)
    : await db
        .select({ wallet: tables.users.wallet })
        .from(tables.users)
        .where(eq(tables.users.ensLabel, label))
        .limit(1);
  return rows.length > 0;
}

/** Reserve `{label}` for this wallet. Fails if another wallet already claimed it. */
export async function claimUserLabel(
  db: AnyDb,
  wallet: `0x${string}`,
  label: string,
): Promise<{ label: string; created: boolean }> {
  const key = wallet.toLowerCase();
  const stored = await getStoredUserLabel(db, wallet);
  // A generated wallet-xxxxxxxx label is a placeholder, not an identity: it may be replaced.
  if (stored && stored !== label && !isAutoLabel(stored)) {
    throw new Error(
      `This wallet already claimed ${stored}. Task subnames stay under that identity.`,
    );
  }
  if (stored === label) return { label, created: false };
  if (await isLabelTaken(db, label, wallet)) {
    throw new Error(`${label} is already claimed by another wallet`);
  }
  await db
    .insert(tables.users)
    .values({ wallet: key, ensLabel: label })
    .onConflictDoUpdate({
      target: tables.users.wallet,
      set: {
        ensLabel: sql`case when ${tables.users.ensLabel} is null or ${tables.users.ensLabel} like 'wallet-%' then excluded.ens_label else ${tables.users.ensLabel} end`,
      },
    });
  const after = await getStoredUserLabel(db, wallet);
  if (after !== label) {
    throw new Error(`${label} is already claimed by another wallet`);
  }
  return { label, created: true };
}
