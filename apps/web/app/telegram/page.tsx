import Link from "next/link";
import { SiteFooter, SiteHeader } from "../components/site-header";

export default function TelegramPage() {
  return (
    <main className="product-page" id="main">
      <SiteHeader />
      <section className="product-page__body">
        <h1>Not in this build</h1>
        <p>
          The live demo is web chat. Telegram stays architecture-ready: the task would still belong
          to the wallet ENS name, not the messenger. This cut does not run a bot or Mini App.
        </p>
        <Link className="btn-primary" href="/chat">
          Open web chat
        </Link>
      </section>
      <SiteFooter />
    </main>
  );
}
