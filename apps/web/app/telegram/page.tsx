import "../env";

import { redirect } from "next/navigation";
import { channelChatUrl } from "../api/channels/pairing";
import { SiteFooter, SiteHeader } from "../components/site-header";

export const dynamic = "force-dynamic";

/** Opens the Telegram chat; the bot sends the wallet verification link from there. */
export default function TelegramPage() {
  const url = channelChatUrl("telegram");
  if (url) redirect(url);
  return (
    <main className="product-page" id="main">
      <SiteHeader />
      <section className="product-page__body">
        <h1>Telegram</h1>
        <p>Telegram is not configured yet.</p>
      </section>
      <SiteFooter />
    </main>
  );
}
