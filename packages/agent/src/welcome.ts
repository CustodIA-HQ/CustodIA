import { WELCOME, welcomePaired, welcomeWithVerify } from "@custodia/schema";
import OpenAI from "openai";
import { loadAgentEnv } from "./config.js";

/** The greeting must come back before a webhook times out; past this we use the fixed text. */
const WELCOME_TIMEOUT_MS = 4_000;

/**
 * Prompt template for the greeting. The facts are fixed; the wording is not,
 * so no two users (or sessions) read the exact same opener.
 */
const WELCOME_PROMPT = `You write the opening message of CustodIA, a chat agent for crypto portfolio protection.
Write ONE short, warm greeting (2–3 sentences, under 60 words) in the user's language ({language}). Vary tone and phrasing; do not reuse stock phrases.
It must convey all of these facts, in your own words:
- The user can ask what ETH is doing, see their portfolio, or ask for protection (e.g. "protect my ETH if it drops 15%").
- CustodIA researches with live market data and proposes a boundary; the user signs it with their own wallet, and the agent only acts inside what was signed.
- Everything runs on test networks.
Do not add links, instructions to verify, emojis beyond one at most, headings, or bullet points. Output only the greeting.`;

export interface WelcomeOptions {
  /** Where the greeting is shown; only affects tone hints. */
  surface: "web" | "telegram" | "whatsapp";
  /** Already paired: the closing line names the wallet. Otherwise it carries the verification link. */
  paired: { wallet: string } | { verifyLink: string } | null;
  /** BCP-47-ish hint, e.g. "en" or "es". */
  language?: string;
}

const closingLine = (paired: WelcomeOptions["paired"]): string => {
  if (!paired) return "";
  if ("wallet" in paired) return `\n\nYou're verified as ${paired.wallet}.`;
  return `\n\nFirst, verify your wallet — open this link and sign (valid 15 minutes): ${paired.verifyLink}`;
};

/** The fixed greeting, used when the model is unavailable or slow. */
export const staticWelcome = (paired: WelcomeOptions["paired"]): string => {
  if (!paired) return WELCOME;
  return "wallet" in paired ? welcomePaired(paired.wallet) : welcomeWithVerify(paired.verifyLink);
};

/**
 * A model-written greeting from the template above, with the fixed
 * verification / paired line appended verbatim (never left to the model).
 * Any failure or timeout falls back to the static text, so a greeting is
 * always sent.
 */
export async function generateWelcome(options: WelcomeOptions): Promise<string> {
  let env: ReturnType<typeof loadAgentEnv>;
  try {
    env = loadAgentEnv();
  } catch {
    return staticWelcome(options.paired);
  }
  const client = new OpenAI({
    apiKey: env.openaiApiKey,
    timeout: WELCOME_TIMEOUT_MS,
    maxRetries: 0,
  });
  try {
    const completion = await client.chat.completions.create({
      model: env.openaiModel,
      ...(env.reasoningEffort ? { reasoning_effort: env.reasoningEffort } : {}),
      messages: [
        {
          role: "system",
          content: WELCOME_PROMPT.replace("{language}", options.language ?? "en"),
        },
        { role: "user", content: `Surface: ${options.surface}. Write the greeting now.` },
      ],
    });
    const text = completion.choices[0]?.message.content?.trim();
    if (!text || text.length > 600) return staticWelcome(options.paired);
    return `${text}${closingLine(options.paired)}`;
  } catch {
    return staticWelcome(options.paired);
  }
}
