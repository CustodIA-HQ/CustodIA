import "../../env";

import { createDb, tables } from "@custodia/db";
import { Bot, webhookCallback } from "grammy";

// Initialize the bot with the token from the environment
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || "mock-token");

bot.on("message:text", async (ctx) => {
  const telegramUserId = ctx.from.id.toString();
  const db = createDb();

  try {
    const { eq, and } = await import("drizzle-orm");
    const [binding] = await db
      .select()
      .from(tables.channelBindings)
      .where(
        and(
          eq(tables.channelBindings.channel, "telegram"),
          eq(tables.channelBindings.externalId, telegramUserId),
        ),
      )
      .limit(1);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    if (!binding) {
      await ctx.reply(`Wallet no vinculada. Por favor, conéctate aquí: ${baseUrl}/telegram`);
      return;
    }

    // User is authenticated
    await ctx.reply(`Reconocido: ${binding.ownerWallet}. Dirígete al chat web: ${baseUrl}/chat`);
  } catch (err) {
    console.error("[telegram] Failed to process message:", err);
    await ctx.reply("An error occurred while processing your message.");
  }
});

// Export the webhook handler for Next.js App Router using the standard HTTP adapter
export const POST = webhookCallback(bot, "std/http");
