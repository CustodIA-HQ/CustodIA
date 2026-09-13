import type { Metadata } from "next";
import { SiteFooter, SiteHeader } from "../components/site-header";

export const metadata: Metadata = { title: "Privacy Policy · CustodIA" };

const LAST_UPDATED = "September 13, 2026";
const CONTACT_EMAIL = "nwrobj@gmail.com";

/** /privacy — required by Meta (WhatsApp Cloud API) and Telegram for a public bot. */
export default function PrivacyPage() {
  return (
    <main className="product-page" id="main">
      <SiteHeader />
      <section className="product-page__body legal">
        <h1>Privacy Policy</h1>
        <p>Last updated: {LAST_UPDATED}</p>
        <p>
          CustodIA is a prototype built for ETHOnline 2026. It lets you talk to an AI agent over
          WhatsApp, Telegram or this website, and sign policy-constrained mandates with your own
          wallet on test networks (Ethereum Sepolia and Hedera testnet). This policy explains what
          data the service handles and why.
        </p>

        <h2>What we collect</h2>
        <ul>
          <li>
            <strong>Chat account identifiers.</strong> Your Telegram user ID, or the phone number
            you message us from on WhatsApp. We store these only to link the chat to your wallet.
          </li>
          <li>
            <strong>Wallet address.</strong> The public address you verify by signing a message.
            We never receive or store private keys.
          </li>
          <li>
            <strong>Messages.</strong> The text you send to the agent, and the agent's replies, so
            the conversation and its resulting proposals can be shown back to you and audited.
          </li>
          <li>
            <strong>Mandates and receipts.</strong> The boundaries you sign (asset permissions,
            limits, expiry), the resulting ENS records, and payment receipts on Hedera testnet.
          </li>
        </ul>
        <p>
          We do not collect names, email addresses, contacts, location or device identifiers, and
          we do not read messages you send to anyone other than the CustodIA bot.
        </p>

        <h2>How we use it</h2>
        <ul>
          <li>To answer your messages and generate mandate proposals.</li>
          <li>To enforce the limits you signed before any simulated or test-network action.</li>
          <li>To keep an audit trail of proposals, signatures and receipts for your tasks.</li>
        </ul>
        <p>We do not sell data, show advertising or use your data to train AI models.</p>

        <h2>Who processes it</h2>
        <ul>
          <li>
            <strong>OpenAI</strong> receives the text of your messages to generate the agent's
            replies, under OpenAI's API data-usage terms.
          </li>
          <li>
            <strong>Meta (WhatsApp Cloud API)</strong> and <strong>Telegram</strong> carry your
            messages to and from the bot, under their own privacy policies.
          </li>
          <li>
            <strong>Neon</strong> hosts our database; <strong>The Graph</strong> supplies public
            market data; <strong>Blocky402 / Hedera</strong> settle the agent's micro-payments.
          </li>
        </ul>

        <h2>Public blockchain data</h2>
        <p>
          Signed mandates are recorded as ENS subnames on Ethereum Sepolia, and agent payments are
          recorded on Hedera testnet. Anything written to a blockchain is public and permanent
          and cannot be deleted by us. These are test networks; the tokens involved have no value.
        </p>

        <h2>Retention and deletion</h2>
        <p>
          Off-chain data (chat links, messages, proposals) is kept while the prototype runs. You
          can unlink your chat account at any time by asking us, and you can revoke any task's
          agent permissions from its task page. Email {CONTACT_EMAIL} to request deletion of your
          off-chain data; we will remove it within 30 days.
        </p>

        <h2>Security</h2>
        <p>
          Wallet verification uses message signatures only; signing never authorizes a transaction
          or moves funds. Webhooks from Meta and Telegram are authenticated, and secrets are kept
          out of the code repository. This is prototype software with no uptime or security
          guarantees; do not use it with wallets that hold real assets.
        </p>

        <h2>Children</h2>
        <p>The service is not directed at anyone under 18.</p>

        <h2>Changes and contact</h2>
        <p>
          We may update this policy as the prototype evolves; the date above will change when we
          do. Questions: {CONTACT_EMAIL}.
        </p>
      </section>
      <SiteFooter />
    </main>
  );
}
