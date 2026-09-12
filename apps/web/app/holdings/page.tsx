import Link from "next/link";
import { SiteFooter, SiteHeader } from "../components/site-header";

export default function HoldingsPage() {
  return (
    <main className="product-page" id="main">
      <SiteHeader active="holdings" />
      <section className="product-page__body">
        <h1>Wallet vs vault</h1>
        <p>
          Supported Sepolia assets: native ETH, WETH (observable only), Circle test USDC. Vault
          balances stay empty until a TaskVault is funded. Sign in chat and ask “Show my Sepolia
          portfolio” for a live snapshot with provenance.
        </p>
        <Link className="btn-primary" href="/chat">
          Open chat
        </Link>
      </section>
      <SiteFooter />
    </main>
  );
}
