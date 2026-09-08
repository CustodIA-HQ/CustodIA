/**
 * Realized volatility of hourly log-returns over a 24 h horizon, in percent.
 *
 * Input must be hourly closes, oldest → newest. Standard deviation of
 * log-returns is per-hour volatility; annualised to the 24 h horizon by
 * scaling by sqrt(24) — the horizon we promise to the risk engine.
 *
 * Pure, deterministic: identical closes always produce identical output.
 */
export function realizedVolPct(closes: number[]): number {
  if (closes.length < 2) return 0;
  const returns: number[] = [];
  closes.reduce((previous, current) => {
    returns.push(Math.log(current / previous));
    return current;
  });
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(24) * 100;
}
