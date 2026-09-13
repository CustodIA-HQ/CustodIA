import { createDb, tables } from "@custodia/db";
import {
  getParentName,
  loadEnsConfig,
  lookupOwnerRecord,
  parseOwnerParam,
  taskDirectoryPath,
  taskSlug,
} from "@custodia/ens";
import { eq, like, or } from "drizzle-orm";
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
  try {
    onchainOwner = await lookupOwnerRecord(loadEnsConfig(), name);
  } catch {
    onchainOwner = null;
  }
  const db = createDb();
  const [user] = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.ensLabel, label))
    .limit(1);
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
