import "../env";

import { redirect } from "next/navigation";
import { channelChatUrl } from "../api/channels/pairing";
import { SiteFooter, SiteHeader } from "../components/site-header";

export const dynamic = "force-dynamic";

/** Opens the WhatsApp chat; the bot sends the wallet verification link from there. */
export default function WhatsAppPage() {
  const url = channelChatUrl("whatsapp");
  if (url) redirect(url);
  return (
    <main className="product-page" id="main">
      <SiteHeader />
      <section className="product-page__body">
        <h1>WhatsApp</h1>
        <p>WhatsApp is not configured yet.</p>
      </section>
      <SiteFooter />
    </main>
  );
}
