import { createDb, tables } from "@custodia/db";
import {
  getParentName,
  loadEnsConfig,
  parseOwnerParam,
  readOwnerRecords,
  taskDirectoryPath,
  taskSlug,
} from "@custodia/ens";
import { and, desc, eq, like, or, sql } from "drizzle-orm";
import Link from "next/link";
import "../env";

export const dynamic = "force-dynamic";

export default async function OwnerDirectoryPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name: raw } = await params;
  const { label, name } = parseOwnerParam(raw, getParentName());
  let onchainOwner: string | null = null;
  let records: Awaited<ReturnType<typeof readOwnerRecords>> | null = null;
  let resolver: string | null = null;
  try {
    const config = loadEnsConfig();
    resolver = config.resolverAddress;
    records = await readOwnerRecords(config, name);
    onchainOwner = records["xyz.custodia.owner"] || null;
  } catch {
    onchainOwner = null;
  }
  const db = createDb();
  const [user] = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.ensLabel, label))
    .limit(1);
  // Proof: the operator transactions that wrote (or cleared) this name's records.
  const proofs = await db
    .select()
    .from(tables.receipts)
    .where(
      and(
        eq(tables.receipts.kind, "ens_tx"),
        sql`${tables.receipts.payload}->>'ensName' = ${name}`,
      ),
    )
    .orderBy(desc(tables.receipts.createdAt));
  const ensSuffix = name.replace(/[^a-z0-9.-]/g, "");
  const ensMatch = like(tables.tasks.ensName, `%.${ensSuffix}`);
  const workflows = await db
    .select()
    .from(tables.tasks)
    .where(user ? or(ensMatch, eq(tables.tasks.userWallet, user.wallet)) : ensMatch);

  return (
    <main className="guard-page">
      <div className="guard-page__topbar">
        <Link href="/">CustodIA</Link>
        <Link href="/chat">Chat</Link>
        <Link href={`/${encodeURIComponent(name)}/wallet`}>Wallet</Link>
        <span>ENS directory</span>
      </div>
      <section className="guard-page__hero">
        <p className="guard-card__eyebrow">Owner namespace</p>
        <h1>{name}</h1>
        <p>
          This identity is <strong>{name}</strong>. Each workflow has an ENS subdomain{" "}
          <strong>&lt;task-hash&gt;.{name}</strong> and a generated website at{" "}
          <strong>{name}/&lt;task-hash&gt;/&lt;task-name&gt;</strong>.
        </p>
        {onchainOwner ? (
          <span className="guard-page__status">Attached to {onchainOwner}</span>
        ) : (
          <span className="guard-page__status">Identity records not on Sepolia yet</span>
        )}
      </section>
      <section className="guard-page__details">
        <p className="guard-card__eyebrow">Proof</p>
        <h2>On-chain identity</h2>
        {records && onchainOwner ? (
          <ul className="wallet-card__tokens">
            <li>
              <div>
                <strong>Owner</strong>
                <span>
                  <a
                    href={`https://sepolia.etherscan.io/address/${onchainOwner}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {onchainOwner}
                  </a>
                </span>
              </div>
            </li>
            <li>
              <div>
                <strong>Kind</strong>
                <span>{records["xyz.custodia.kind"] || "—"}</span>
              </div>
            </li>
            <li>
              <div>
                <strong>Agent (scoped key)</strong>
                <span>{records["xyz.custodia.agent"] || "—"}</span>
              </div>
            </li>
            <li>
              <div>
                <strong>Resolver</strong>
                <span>
                  {resolver ? (
                    <a
                      href={`https://sepolia.etherscan.io/address/${resolver}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {resolver}
                    </a>
                  ) : (
                    "—"
                  )}
                </span>
              </div>
            </li>
            {proofs.map((r) => (
              <li key={r.id}>
                <div>
                  <strong>
                    {(r.payload as { step?: string })?.step === "release" ? "Released" : "Attached"}
                  </strong>
                  <span>
                    {r.createdAt.toLocaleString()} ·{" "}
                    <a
                      href={`https://sepolia.etherscan.io/tx/${r.txId}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {r.txId.slice(0, 12)}…
                    </a>
                  </span>
                </div>
              </li>
            ))}
            <li>
              <div>
                <strong>ENS</strong>
                <span>
                  <a
                    href={`https://sepolia.app.ens.domains/${name}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    open {name} in the ENS app
                  </a>
                </span>
              </div>
            </li>
          </ul>
        ) : (
          <p className="guard-page__muted">
            No identity records on Sepolia for this name
            {records?.["xyz.custodia.kind"] === "released" ? " (released)" : ""}.
          </p>
        )}
      </section>
      <section className="guard-page__details">
        <p className="guard-card__eyebrow">Workflows</p>
        <h2>Tasks under this ENS</h2>
        {workflows.length === 0 ? (
          <p className="guard-page__muted">No published workflows yet.</p>
        ) : (
          <ul className="wallet-card__tokens">
            {workflows.map((task) => {
              const path = taskDirectoryPath(name, task.id, task.template);
              return (
                <li key={task.id}>
                  <div>
                    <strong>
                      <Link href={path}>{`${name}/${task.id}/${taskSlug(task.template)}`}</Link>
                    </strong>
                    <span>
                      {task.status} · {task.ensName}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
