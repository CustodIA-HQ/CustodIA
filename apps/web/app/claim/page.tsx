import "../env";

import { getParentName } from "@custodia/ens";
import { readClaimToken } from "@custodia/runtime";
import { SiteFooter, SiteHeader } from "../components/site-header";
import { ClaimSign } from "./claim-sign";

export const dynamic = "force-dynamic";

/** /claim?t=<token> — from the bot's link: sign once to claim <label>.custodia.eth. */
export default async function ClaimPage({
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
            <h1>Claim {name}</h1>
            <p>
              Sign a message with wallet {ticket.wallet.slice(0, 8)}…{ticket.wallet.slice(-4)} to
              make {name} your CustodIA identity. Your tasks will be published as subnames of it.
              The signature does not approve a transaction or move funds.
            </p>
            <ClaimSign
              token={token}
              name={name}
              wallet={ticket.wallet}
              expiresAt={ticket.expiresAt}
            />
          </>
        ) : (
          <>
            <h1>Link expired</h1>
            <p>
              This claim link is invalid or has expired. Ask the bot again: “claim &lt;name&gt;”.
            </p>
          </>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
