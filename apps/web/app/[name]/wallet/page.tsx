import "../../env";

import { createDb, tables } from "@custodia/db";
import { getParentName, parseOwnerParam } from "@custodia/ens";
import { listEvents, summarizeRunEvents } from "@custodia/runtime";
import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { BalanceCard } from "../../components/balance-card";
import { SiteFooter, SiteHeader } from "../../components/site-header";

export const dynamic = "force-dynamic";

/**
 * /<label>.custodia.eth/wallet — the owner's wallet view under their ENS
 * namespace: the latest portfolio snapshot the agent read, priced with the
 * market context of that run. Balances are on-chain public data; the name →
 * wallet link is the ENS record itself.
 */
export default async function OwnerWalletPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: raw } = await params;
  const { label, name } = parseOwnerParam(raw, getParentName());
  const db = createDb();
  const [user] = await db
    .select()
    .from(tables.users)
    .where(eq(tables.users.ensLabel, label))
    .limit(1);

  let summary: ReturnType<typeof summarizeRunEvents> | null = null;
  let observedAt: Date | null = null;
  if (user) {
    // Newest run that read the wallet: the one whose events carry a read_portfolio output.
    const runs = await db
      .select({ id: tables.runs.id, createdAt: tables.runs.createdAt })
      .from(tables.runs)
      .where(sql`lower(${tables.runs.ownerWallet}) = ${user.wallet.toLowerCase()}`)
      .orderBy(desc(tables.runs.createdAt))
      .limit(25);
    for (const run of runs) {
      const candidate = summarizeRunEvents(await listEvents(db as never, run.id));
      if (candidate.snapshot) {
        summary = candidate;
        observedAt = run.createdAt;
        break;
      }
    }
  }

  return (
    <main className="product-page" id="main">
      <SiteHeader />
      <section className="product-page__body">
        <p className="guard-card__eyebrow">
          <Link href={`/${encodeURIComponent(name)}`}>{name}</Link> · wallet
        </p>
        {summary?.snapshot ? (
          <>
            <h1>Wallet</h1>
            <p>
              Sepolia balances as last read by the agent
              {observedAt ? ` on ${observedAt.toLocaleString()}` : ""}, priced with live ETH/USDC
              from The Graph. Ask the bot to show your portfolio for a fresh read.
            </p>
            <BalanceCard {...summary.snapshot} />
          </>
        ) : (
          <>
            <h1>No snapshot yet</h1>
            <p>
              {user
                ? "The agent has not read this wallet yet. Ask it to show your portfolio in chat."
                : `No CustodIA identity is registered as ${name}.`}
            </p>
          </>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
