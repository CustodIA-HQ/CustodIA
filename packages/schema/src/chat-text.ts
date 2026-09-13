/**
 * Shared wording for wallet answers, so web chat, Telegram and WhatsApp say
 * the same thing. Pure: no runtime or browser dependencies.
 */

/** "in text", "as text", "en texto", "without a chart" … — the user asked for words, not a graph. */
export const wantsTextOnly = (message: string): boolean =>
  /\b(in|as|plain|only|solo|en)\s+text[o]?\b|\b(no|without|sin)\s+(?:an?\s+|the\s+|una?\s+|el\s+)?(graph|chart|gr[aá]fic[ao]s?)/i.test(
    message,
  );

const fmt = (value: number, digits: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: digits });

/** One-line priced snapshot, the text stand-in for the wallet card. */
export const holdingsLine = (
  portfolio: { eth?: string; usdc?: string; weth?: string; chain?: string },
  priceUsd: number | null,
): string => {
  const eth = Number(portfolio.eth ?? 0);
  const usdc = Number(portfolio.usdc ?? 0);
  const weth = Number(portfolio.weth ?? 0);
  const ethPart =
    priceUsd !== null
      ? `${fmt(eth, 4)} ETH (~$${fmt(eth * priceUsd, 0)} at $${fmt(priceUsd, 0)})`
      : `${fmt(eth, 4)} ETH`;
  return `Wallet on ${portfolio.chain ?? "Sepolia"}: ${ethPart}, ${fmt(usdc, 2)} USDC, ${fmt(weth, 4)} WETH. Testnet balances, no real value.`;
};

/** The bot's opening line, identical on web chat, Telegram and WhatsApp. */
export const WELCOME =
  'Hi, I\'m CustodIA 👋 Ask me what ETH is doing, show your portfolio, or say something like "protect my ETH if it drops 15%". I research with live market data and propose a boundary — you sign it with your wallet, and I only ever act inside what you signed. Everything here runs on testnets.';

/** Welcome plus the wallet verification step for a chat that is not paired yet. */
export const welcomeWithVerify = (link: string): string =>
  `${WELCOME}\n\nFirst, verify your wallet — open this link and sign (valid 15 minutes): ${link}`;

/** Welcome for a chat that is already paired. */
export const welcomePaired = (wallet: string): string =>
  `${WELCOME}\n\nYou're verified as ${wallet}.`;
