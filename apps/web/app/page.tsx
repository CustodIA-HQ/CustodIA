import Link from "next/link";
import { ChannelButtons } from "./components/channel-buttons";
import { ChatEntrySection } from "./components/chat-entry-section";
import { HomeShell } from "./components/home-shell";
import { SiteFooter, SiteHeader } from "./components/site-header";
import { TickerBand } from "./components/ticker-band";
import { UseCasesMarquee } from "./components/use-cases-marquee";

export default function Home() {
  return (
    <HomeShell>
      <main className="home" id="main">
        <SiteHeader active="home" />

        <section className="home-hero">
          <div className="home-hero__copy">
            <h1>
              The agent proposes.
              <br />
              You sign the boundary.
              <br />
              Policy enforces it.
            </h1>
            <p>
              Write an intent in chat. Market questions stay in the thread. Protection and guards
              become a signed mandate at <strong>you.custodia.eth/task-hash/name</strong>. Live
              ETH/USDC from The Graph; paid risk context on Hedera.
            </p>
            <div className="home-hero__actions">
              <ChannelButtons />
              <Link className="btn-ghost" href="/ux">
                See generated UX
              </Link>
            </div>
            <p className="home-hero__note">
              Sepolia and Hedera testnet. Test tokens have no value. Execution is simulated.
            </p>
          </div>
          <aside className="home-hero__visual" aria-label="CustodIA Logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/falcon-eye/falcon-eye-reference.png"
              alt="CustodIA Eye Logo"
              style={{ width: "100%", maxWidth: "600px", margin: "0 auto", display: "block" }}
            />
          </aside>
        </section>

        <TickerBand direction="ltr" />

        <section className="home-loop">
          <h2>How a task is born</h2>
          <ol>
            <li>
              <strong>Sign</strong>
              <span>
                Wallet proves control of this conversation. Then you claim a name under
                custodia.eth.
              </span>
            </li>
            <li>
              <strong>Research</strong>
              <span>
                Live Uniswap V3 data from The Graph. Paid risk context over x402 on Hedera.
              </span>
            </li>
            <li>
              <strong>Generate</strong>
              <span>
                The platform renders a typed UI. The model never writes HTML or its own limits.
              </span>
            </li>
            <li>
              <strong>Publish</strong>
              <span>
                You sign the mandate. ENS records and a directory URL go on the task subname.
              </span>
            </li>
          </ol>
        </section>

        <section className="home-cases">
          <div className="home-cases__intro">
            <p className="home-cases__kicker">Interfaces</p>
            <h2>Every case has an interface</h2>
            <p>
              Protection, portfolio, collateral, spot, futures, comparison, and a hard stop when the
              action is outside the envelope. Ask in chat or open a sample.
            </p>
          </div>
          <UseCasesMarquee />
        </section>

        <ChatEntrySection />

        <section className="home-rails">
          <h2>What has to be real</h2>
          <dl>
            <div>
              <dt>ENSv2</dt>
              <dd>
                Owner name plus a task subname. Agent rights are scoped. Revoke one task, siblings
                stay.
              </dd>
            </div>
            <div>
              <dt>The Graph</dt>
              <dd>
                Price, realized volatility, and pool depth change the generated UI. This is not a
                decorative chart.
              </dd>
            </div>
            <div>
              <dt>Hedera x402</dt>
              <dd>
                The agent pays for risk context it actually uses. Receipt sits in the audit trail.
              </dd>
            </div>
          </dl>
        </section>

        <section className="home-close">
          <h2>The agent can propose more risk. It cannot authorize it.</h2>
          <ChannelButtons className="channel-buttons--close" />
        </section>

        <SiteFooter />
      </main>
    </HomeShell>
  );
}
