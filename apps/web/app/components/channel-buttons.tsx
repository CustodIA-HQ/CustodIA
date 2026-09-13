import Link from "next/link";

export function ChannelButtons({ className }: { className?: string }) {
  return (
    <div className={className ? `channel-buttons ${className}` : "channel-buttons"}>
      <Link className="channel-btn channel-btn--whatsapp" href="/chat">
        <img src="/brand/channels/whatsapp.webp" alt="" width={28} height={28} />
        WhatsApp
      </Link>
      <Link className="channel-btn channel-btn--telegram" href="/chat">
        <img src="/brand/channels/telegram.webp" alt="" width={28} height={28} />
        Telegram
      </Link>
    </div>
  );
}
