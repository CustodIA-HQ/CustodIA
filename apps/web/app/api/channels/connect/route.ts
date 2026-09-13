import "../../../env";

import { createDb } from "@custodia/db";
import { bindChannel, queueChannelMessage } from "@custodia/runtime";
import { NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { z } from "zod";
import { normalizeAddress } from "../../identity";
import { channelChatUrl, connectMessage, readConnectToken } from "../pairing";

const BodySchema = z
  .object({
    token: z.string().min(1).max(512),
    address: z.string().min(1),
    signature: z
      .string()
      .regex(/^0x[0-9a-f]+$/i, "expected a hex wallet signature")
      .optional(),
  })
  .strict();

let db: ReturnType<typeof createDb> | undefined;
const getDb = () => {
  db ??= createDb();
  return db;
};

/**
 * POST /api/channels/connect { token, address, signature? } — the chat-first
 * pairing step. Without a signature it returns the message to sign; with one
 * it verifies the wallet signed that exact message, binds the chat account
 * named in the token to the wallet and confirms in the chat.
 */
export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid verification request" }, { status: 400 });
  }
  let address: ReturnType<typeof normalizeAddress>;
  try {
    address = normalizeAddress(parsed.data.address);
  } catch {
    return NextResponse.json({ error: "The wallet returned an invalid address" }, { status: 400 });
  }
  const claim = readConnectToken(parsed.data.token);
  if (!claim) {
    return NextResponse.json(
      { error: "This link is invalid or expired. Send any message to the bot for a new one." },
      { status: 401 },
    );
  }

  const message = connectMessage(claim, address);
  if (!parsed.data.signature) return NextResponse.json({ message });

  const valid = await verifyMessage({
    address,
    message,
    signature: parsed.data.signature as `0x${string}`,
  }).catch(() => false);
  if (!valid) {
    return NextResponse.json(
      { error: "The signature does not match this wallet" },
      { status: 401 },
    );
  }

  try {
    await bindChannel(getDb(), {
      channel: claim.channel,
      externalId: claim.externalId,
      ownerWallet: address,
    });
    // Private chats only, so the account id is also the chat to answer in.
    await queueChannelMessage(
      getDb(),
      { channel: claim.channel, chatId: claim.externalId },
      `Wallet verified: ${address}. Ask about ETH or set a protection boundary.`,
    );
  } catch (error) {
    console.error(`[channels/connect] ${error instanceof Error ? error.name : "Error"}`);
    return NextResponse.json(
      { error: "Verification is temporarily unavailable. Try again in a moment." },
      { status: 503 },
    );
  }
  return NextResponse.json({
    wallet: address,
    channel: claim.channel,
    chatUrl: channelChatUrl(claim.channel),
  });
}
