import "../env";

import { channelChatUrl, readConnectToken } from "../api/channels/pairing";
import { SiteFooter, SiteHeader } from "../components/site-header";
import { ConnectWallet } from "./connect-wallet";

export const dynamic = "force-dynamic";

const LABEL = { telegram: "Telegram", whatsapp: "WhatsApp" } as const;

/** /connect?t=<token> — opened from the bot's link to verify the chat account with a wallet. */
export default async function ConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string | string[] }>;
}) {
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : "";
  const claim = token ? readConnectToken(token) : null;

  return (
    <main className="product-page" id="main">
      <SiteHeader />
      <section className="product-page__body">
        {claim ? (
          <>
            <h1>Verify your wallet</h1>
            <p>
              Sign a message with your wallet to link this {LABEL[claim.channel]} chat to it. The
              signature proves you own the wallet. It does not approve a transaction or move funds.
            </p>
            <ConnectWallet
              token={token}
              channelLabel={LABEL[claim.channel]}
              chatUrl={channelChatUrl(claim.channel)}
              expiresAt={claim.expiresAt}
            />
          </>
        ) : (
          <>
            <h1>Link expired</h1>
            <p>
              This verification link is invalid or has expired. Send any message to the CustodIA bot
              on WhatsApp or Telegram and it will reply with a new link.
            </p>
          </>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
