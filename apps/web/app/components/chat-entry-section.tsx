import { ChatPhoneMockup } from "./chat-phone-mockup";
import { TickerBand } from "./ticker-band";

export function ChatEntrySection() {
  return (
    <section className="chat-entry" aria-labelledby="chat-entry-heading">
      <TickerBand direction="ltr" />

      <div className="chat-entry__inner">
        <div className="chat-entry__block chat-entry__block--flow">
          <div className="chat-entry__copy">
            <p className="chat-entry__kicker">Channels</p>
            <h2 id="chat-entry-heading">Talk in chat. Confirm on the web.</h2>
            <p>
              CustodIA receives instructions through WhatsApp or Telegram, then sends a secure
              interface link so you can review charts, risk context, and confirm.
            </p>
          </div>
          <div className="chat-entry__phones" aria-hidden="true">
            <ChatPhoneMockup kind="whatsapp" />
            <ChatPhoneMockup kind="telegram" />
          </div>
        </div>

        <div className="chat-entry__block chat-entry__block--brand">
          <div className="chat-entry__falcon-wrap">
            <img
              className="chat-entry__falcon"
              src="/brand/falcon-eye/falcon-eye-reference.png"
              alt=""
              width={1448}
              height={1086}
            />
          </div>
          <div className="chat-entry__copy">
            <p className="chat-entry__kicker">Oversight</p>
            <h2>Review first. Authorize second.</h2>
            <p>
              The agent can propose the next move. You inspect the interface, the charts, and the
              boundary. Then you decide.
            </p>
          </div>
        </div>
      </div>

      <TickerBand direction="rtl" />
    </section>
  );
}
