import { tables } from "@custodia/db";
import {
  createOwnerName,
  directoryUrl,
  getParentName,
  loadEnsConfig,
  makeOwnerName,
  ownerDirectoryPath,
} from "@custodia/ens";
import { sql } from "drizzle-orm";
import { notifyOwner } from "../channels.js";
import type { JobHandler } from "../registry.js";
import { getStoredUserLabel } from "../users.js";

const SEPOLIA = "eip155:11155111";

/**
 * kind: ens.attach — payload { wallet, label }.
 * Mints `{label}.{parent}` after the owner signed the claim. Idempotent.
 */
export const ensAttachHandler: JobHandler = async ({ db, job }) => {
  const { wallet, label: requested } = job.payload as { wallet: `0x${string}`; label?: string };
  const label = requested ?? (await getStoredUserLabel(db, wallet));
  if (!label) throw new Error("ens.attach requires a claimed ENS label");
  const config = loadEnsConfig();
  const name = makeOwnerName(label, config.parentName);
  const attached = await createOwnerName(config, {
    userLabel: label,
    owner: wallet,
    agent: config.agentAddress,
    url: directoryUrl(ownerDirectoryPath(name)),
  });
  await db
    .insert(tables.users)
    .values({ wallet: wallet.toLowerCase(), ensLabel: label })
    .onConflictDoUpdate({
      target: tables.users.wallet,
      set: { ensLabel: sql`coalesce(${tables.users.ensLabel}, excluded.ens_label)` },
    });
  if (!attached.created || !attached.recordsTxId) return;
  await notifyOwner(
    db,
    wallet,
    `${attached.name} is now yours on Sepolia ENS. Directory: ${directoryUrl(ownerDirectoryPath(attached.name))}\nTx: https://sepolia.etherscan.io/tx/${attached.recordsTxId}`,
  );

  await db.insert(tables.receipts).values({
    kind: "ens_tx",
    txId: attached.recordsTxId,
    network: SEPOLIA,
    payload: { step: "owner", ensName: attached.name },
  });
  await db.insert(tables.outbox).values({
    channel: "web",
    target: wallet.toLowerCase(),
    payload: {
      type: "identity.attached",
      ensName: attached.name,
      parentName: getParentName(),
      expected: makeOwnerName(label, config.parentName),
    },
  });
};
