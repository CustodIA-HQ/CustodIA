import "../../env";

import { createDb, tables } from "@custodia/db";
import { Bot, webhookCallback } from "grammy";

// Initialize the bot with the token from the environment
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || "mock-token");

bot.on("message:text", async (ctx) => {
  // Generate an opaque 8-hex-char ID
  const id = crypto.randomUUID().replace(/-/g, "").substring(0, 8);
  
  // Extract user info
  const telegramUserId = ctx.from.id.toString();
  
  // Connect to the DB
  const db = createDb();

  try {
    // Insert a new task. Since this originates from Telegram, we lack a real wallet
    // and ENS name initially, so we use placeholders indicating the source.
    await db.insert(tables.tasks).values({
      id,
      userWallet: `tg:${telegramUserId}`,
      ensName: `tg-${telegramUserId}.custodia.eth`, // Mock ENS label
    });

    // Build the deep link. Assumes NEXT_PUBLIC_APP_URL is set, or fall back to localhost.
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const deepLink = `${baseUrl}/task/${id}`;

    // Reply with a concise message containing the deep link
    await ctx.reply(`Task created. Proceed here: ${deepLink}`);
  } catch (err) {
    console.error("[telegram] Failed to create task:", err);
    await ctx.reply("An error occurred while creating the task.");
  }
});

// Export the webhook handler for Next.js App Router using the standard HTTP adapter
export const POST = webhookCallback(bot, "std/http");
