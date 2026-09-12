import type { Intent } from "@custodia/schema";

/** Keyword router — the model never invents an intent class. */
export function classifyIntent(message: string): Intent {
  const text = message.toLowerCase();
  if (/\b(holdings?|portfolio|balance|wallet|snapshot)\b/.test(text)) return "holdings";
  if (/(compar|evaluat|alternativ)/.test(text)) return "evaluate";
  if (/\b(status|active task|my task|open task)\b/.test(text)) return "active_task";
  if (/\b(mainnet|bridge)\b/.test(text)) return "unsupported";
  if (/\b(health factor|collateral|liquidat)/.test(text)) return "collateral";
  if (/\b(perps?|futures?|leverage)\b/.test(text)) return "futures";
  if (/\b(buy|sell|swap|compra|cierra|trade)\b/.test(text)) return "execute";
  if (/(protect|deductible|presupuesto|vigencia|if eth .{0,24}(drop|fall|cae))/.test(text)) {
    return "protect";
  }
  if (/(guard|drawdown|mandate|rebalance|keep \$|allocat)/.test(text)) return "guard";
  if (
    /\b(what is eth|what'?s eth|price|volatil|tvl|doing today|how is eth|market context)\b/.test(
      text,
    )
  ) {
    return "research";
  }
  return "research";
}
