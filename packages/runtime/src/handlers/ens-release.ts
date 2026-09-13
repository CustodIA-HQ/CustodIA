import { tables } from "@custodia/db";
import { loadEnsConfig, makeOwnerName, releaseOwnerName } from "@custodia/ens";
import { and, eq, inArray, sql } from "drizzle-orm";
import { notifyOwner } from "../channels.js";
import type { JobHandler } from "../registry.js";

const SEPOLIA = "eip155:11155111";

/**
 * kind: ens.release — payload { wallet, label }. The owner signed a release on
 * the web; clear the identity records on Sepolia and forget the label, so
 * the name is claimable again and the wallet is back to "no name". Refused
 * while the name still has live tasks — revoke them first.
 */
export const ensReleaseHandler: JobHandler = async ({ db, job }) => {
  const { wallet, label } = job.payload as { wallet: `0x${string}`; label: string };
  const config = loadEnsConfig();
  const name = makeOwnerName(label, config.parentName);
  const live = await db
    .select({ id: tables.tasks.id })
    .from(tables.tasks)
    .where(
      and(
        sql`lower(${tables.tasks.userWallet}) = ${wallet.toLowerCase()}`,
        inArray(tables.tasks.status, ["active", "awaiting_authorization", "draft"]),
      ),
    );
  if (live.length > 0) {
    await notifyOwner(
      db,
      wallet,
      `${name} still has ${live.length} live task${live.length === 1 ? "" : "s"} under it. Revoke them first, then ask again to release the name.`,
    );
    return;
  }
  const result = await releaseOwnerName(config, { userLabel: label, owner: wallet });
  await db
    .delete(tables.users)
    .where(and(eq(tables.users.wallet, wallet.toLowerCase()), eq(tables.users.ensLabel, label)));
  if (result.recordsTxId) {
    await db.insert(tables.receipts).values({
      kind: "ens_tx",
      txId: result.recordsTxId,
      network: SEPOLIA,
      payload: { step: "release", ensName: name },
    });
  }
  await db.insert(tables.outbox).values({
    channel: "web",
    target: wallet.toLowerCase(),
    payload: { type: "identity.released", ensName: name },
  });
  await notifyOwner(
    db,
    wallet,
    result.recordsTxId
      ? `${name} has been released. Its records on Sepolia are cleared — Tx: https://sepolia.etherscan.io/tx/${result.recordsTxId}\n\nYou have no CustodIA name now; say "claim <name>" whenever you want a new one.`
      : `${name} was not attached on-chain; it is no longer linked to your wallet. Say "claim <name>" whenever you want a new one.`,
  );
};
