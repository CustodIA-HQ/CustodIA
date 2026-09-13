import "../env";

import { getParentName } from "@custodia/ens";
import { readClaimToken } from "@custodia/runtime";
import { SiteFooter, SiteHeader } from "../components/site-header";
import { ReleaseSign } from "./release-sign";

export const dynamic = "force-dynamic";

/** /release?t=<token> — from the bot's link: sign once to release <label>.custodia.eth. */
export default async function ReleasePage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : "";
  const ticket = token ? readClaimToken(token) : null;
  const name = ticket ? `${ticket.label}.${getParentName()}` : null;
  return (
    <main className="product-page" id="main">
      <SiteHeader />
      <section className="product-page__body">
        {ticket && name ? (
          <>
            <h1>Release {name}</h1>
            <p>
              This clears the identity records of {name} on Sepolia and frees the name. Tasks
              published under it must already be revoked. Sign with wallet{" "}
              {ticket.wallet.slice(0, 8)}…{ticket.wallet.slice(-4)} to confirm — no transaction from
              your wallet, no funds move.
            </p>
            <ReleaseSign token={token} name={name} wallet={ticket.wallet} />
          </>
        ) : (
          <>
            <h1>Link expired</h1>
            <p>
              This release link is invalid or has expired. Ask the bot again: “release my name”.
            </p>
          </>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
