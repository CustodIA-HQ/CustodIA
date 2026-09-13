type PhoneKind = "whatsapp" | "telegram";

const THREADS: Record<
  PhoneKind,
  {
    app: string;
    time: string;
    status: string;
    user: string;
    bot: string[];
    action: string;
  }
> = {
  whatsapp: {
    app: "WhatsApp",
    time: "21:14",
    status: "online",
    user: "Protect me if ETH drops more than 15%",
    bot: [
      "Understood. I prepared a review link for this protection setup.",
      "Open the secure interface to review charts and confirm.",
    ],
    action: "Open review",
  },
  telegram: {
    app: "Telegram",
    time: "21:16",
    status: "bot",
    user: "Buy 500 USDC of ETH",
    bot: ["Draft ready.", "Review charts and confirm in the browser."],
    action: "View confirmation",
  },
};

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15.2 4.8 7.8 12l7.4 7.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.4 11.2 20.6 4.4 13.2 21.2l-1.5-7.2-8.3-2.8Z" fill="currentColor" />
    </svg>
  );
}

export function ChatPhoneMockup({ kind }: { kind: PhoneKind }) {
  const thread = THREADS[kind];

  return (
    <figure className={`chat-phone chat-phone--${kind}`}>
      <div className="chat-phone__shell">
        <span className="chat-phone__btn chat-phone__btn--silent" />
        <span className="chat-phone__btn chat-phone__btn--vol-up" />
        <span className="chat-phone__btn chat-phone__btn--vol-down" />
        <span className="chat-phone__btn chat-phone__btn--power" />
        <div className="chat-phone__glass">
          <span className="chat-phone__island" />
          <header className="chat-phone__chrome">
            <span>{thread.time}</span>
            <span>5G</span>
          </header>
          <div className="chat-phone__appbar">
            <BackIcon />
            <img
              className="chat-phone__avatar"
              src="/brand/falcon-eye/falcon-eye-reference.png"
              alt=""
              width={1448}
              height={1086}
            />
            <span className="chat-phone__meta">
              <strong>CustodIA</strong>
              <em>{thread.status}</em>
            </span>
          </div>
          <div className="chat-phone__thread">
            <p className="chat-phone__bubble chat-phone__bubble--user chat-phone__msg chat-phone__msg--1">
              {thread.user}
              <span className="chat-phone__stamp">
                {thread.time}
                <i />
              </span>
            </p>
            <div className="chat-phone__typing" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p className="chat-phone__bubble chat-phone__bubble--agent chat-phone__msg chat-phone__msg--2">
              {thread.bot[0]}
              <span className="chat-phone__stamp">{thread.time}</span>
            </p>
            <p className="chat-phone__bubble chat-phone__bubble--agent chat-phone__msg chat-phone__msg--3">
              {thread.bot[1]}
              <span className="chat-phone__action">{thread.action}</span>
              <span className="chat-phone__stamp">{thread.time}</span>
            </p>
          </div>
          <div className="chat-phone__composer">
            <span className="chat-phone__field">Message</span>
            <span className="chat-phone__send">
              <SendIcon />
            </span>
          </div>
        </div>
      </div>
      <figcaption className="chat-phone__caption">{thread.app}</figcaption>
    </figure>
  );
}
