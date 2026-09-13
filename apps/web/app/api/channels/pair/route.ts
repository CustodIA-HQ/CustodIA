import "../../../env";

import { NextResponse } from "next/server";
import { z } from "zod";
import { sessionFrom } from "../../session";
import { createPairingCode } from "../pairing";

const BodySchema = z.object({ channel: z.enum(["telegram", "whatsapp"]) }).strict();

/** The deep link that opens the channel with the pairing code prefilled. */
const linkFor = (channel: "telegram" | "whatsapp", code: string): string | null => {
  if (channel === "telegram") {
    const bot = process.env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "");
    return bot ? `https://t.me/${bot}?start=${code}` : null;
  }
  const number = process.env.WHATSAPP_BUSINESS_NUMBER?.replace(/\D/g, "");
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(`CONNECT ${code}`)}` : null;
};

/**
 * POST /api/channels/pair { channel } — a signed web session gets a
 * short-lived deep link that pairs the chat account opening it with the
 * session wallet.
 */
export async function POST(request: Request) {
  const session = sessionFrom(request);
  if (!session) {
    return NextResponse.json(
      { error: "Sign in on web chat with your wallet first." },
      { status: 401 },
    );
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "channel must be telegram or whatsapp" }, { status: 400 });
  }
  const { channel } = parsed.data;
  const { code, expiresAt } = createPairingCode(channel, session.address);
  const url = linkFor(channel, code);
  if (!url) {
    const missing = channel === "telegram" ? "TELEGRAM_BOT_USERNAME" : "WHATSAPP_BUSINESS_NUMBER";
    return NextResponse.json({ error: `${missing} is not set` }, { status: 503 });
  }
  return NextResponse.json({ url, wallet: session.address, expiresAt });
}
