import "../env";

import { createDb } from "@custodia/db";
import { listEvents, loadRun, readWalletViewToken, summarizeRunEvents } from "@custodia/runtime";
import { BalanceCard } from "../components/balance-card";
import { SiteFooter, SiteHeader } from "../components/site-header";

export const dynamic = "force-dynamic";

/** /wallet?t=<token> — the graph view of a chat user's wallet snapshot, from the bot's link. */
export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { t } = await searchParams;
  const runId = typeof t === "string" ? readWalletViewToken(t) : null;
  const db = runId ? createDb() : null;
  const run = db && runId ? await loadRun(db, runId) : null;
  const summary = db && run ? summarizeRunEvents(await listEvents(db, run.id)) : null;

  return (
    <main className="product-page" id="main">
      <SiteHeader />
      <section className="product-page__body">
        {summary?.snapshot ? (
          <>
            <h1>Your wallet</h1>
            <p>
              {summary.text ||
                "Current Sepolia balances priced with live ETH/USDC from The Graph. Testnet only."}
            </p>
            <BalanceCard {...summary.snapshot} />
          </>
        ) : (
          <>
            <h1>Link expired</h1>
            <p>
              This wallet view has expired or is invalid. Ask the CustodIA bot to show your
              portfolio again and it will send a fresh link.
            </p>
          </>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
