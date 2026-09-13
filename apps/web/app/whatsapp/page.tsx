import { ConnectChannel } from "../components/connect-channel";
import { SiteFooter, SiteHeader } from "../components/site-header";

export default function WhatsAppPage() {
  return (
    <main className="product-page" id="main">
      <SiteHeader />
      <section className="product-page__body">
        <h1>WhatsApp</h1>
        <p>
          WhatsApp is transport: the task still belongs to your wallet ENS name. Sign in on web
          chat, then pair your WhatsApp number with that wallet. Signing a boundary always happens
          on the web page.
        </p>
        <ConnectChannel channel="whatsapp" />
      </section>
      <SiteFooter />
    </main>
  );
}
