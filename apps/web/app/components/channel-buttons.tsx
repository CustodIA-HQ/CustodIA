import Link from "next/link";

export function ChannelButtons({ className }: { className?: string }) {
  return (
    <div className={className ? `channel-buttons ${className}` : "channel-buttons"}>
      <Link className="channel-btn channel-btn--whatsapp" href="/whatsapp">
        <img src="/brand/channels/whatsapp.webp" alt="" width={28} height={28} />
        WhatsApp
      </Link>
      <Link className="channel-btn channel-btn--telegram" href="/telegram">
        <img src="/brand/channels/telegram.webp" alt="" width={28} height={28} />
        Telegram
      </Link>
      <Link className="channel-btn channel-btn--web" href="/chat">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.4 3.5A.6.6 0 0 1 4.6 19V16A2.5 2.5 0 0 1 4 13.5z"
            fill="currentColor"
          />
        </svg>
        Web chat
      </Link>
    </div>
  );
}
