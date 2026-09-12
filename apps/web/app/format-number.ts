export type NumberContext = "compact" | "detailed";

export interface FormatResult {
  display: string;
  raw: string;
  ariaLabel: string;
}

const PLACEHOLDER = "--";

function toRaw(value: number): string {
  if (value === 0) return "0";
  const str = value.toString();
  if (!str.includes("e") && !str.includes("E")) return str;
  return value.toFixed(20).replace(/\.?0+$/, "");
}

function abbreviate(abs: number): string | null {
  const suffixes = [
    { threshold: 1e12, suffix: "T" },
    { threshold: 1e9, suffix: "B" },
    { threshold: 1e6, suffix: "M" },
    { threshold: 1e3, suffix: "K" },
  ];
  for (const { threshold, suffix } of suffixes) {
    if (abs >= threshold) {
      const formatted = (abs / threshold).toFixed(1).replace(/\.0$/, "");
      return `${formatted}${suffix}`;
    }
  }
  return null;
}

export function formatFiat(
  value: number | null | undefined,
  context: NumberContext = "compact",
): FormatResult {
  if (value == null || !Number.isFinite(value)) {
    return { display: PLACEHOLDER, raw: "", ariaLabel: "no data" };
  }
  let amount = value;
  if (Object.is(amount, -0) || Math.abs(amount) < Number.EPSILON * 10) amount = 0;
  if (amount === 0) return { display: "$0.00", raw: "0", ariaLabel: "$0.00" };
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  if (abs < 0.01) {
    const display = `${sign}<$0.01`;
    return { display, raw: toRaw(value), ariaLabel: display };
  }
  if (context === "compact") {
    const short = abbreviate(abs);
    if (short) {
      const display = `${sign}$${short}`;
      return { display, raw: toRaw(value), ariaLabel: display };
    }
  }
  const display = `${sign}$${abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
  return { display, raw: toRaw(value), ariaLabel: display };
}

export function formatTokenAmount(
  value: number | null | undefined,
  tokenPriceUsd?: number,
  context: NumberContext = "detailed",
): FormatResult {
  if (value == null || !Number.isFinite(value)) {
    return { display: PLACEHOLDER, raw: "", ariaLabel: "no data" };
  }
  let amount = value;
  if (Object.is(amount, -0) || Math.abs(amount) < Number.EPSILON * 10) amount = 0;
  if (amount === 0) return { display: "0", raw: "0", ariaLabel: "0" };
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(amount);
  const threshold = context === "compact" ? 0.01 : 0.0001;
  const clamp = context === "compact" ? 6 : 12;
  const decimals =
    tokenPriceUsd && tokenPriceUsd > 0
      ? Math.min(clamp, Math.max(0, Math.ceil(-Math.log10(threshold / tokenPriceUsd))))
      : 4;
  const rounded = Number(abs.toFixed(decimals));
  if (rounded === 0) {
    const display = `${sign}<0.001`;
    return { display, raw: toRaw(value), ariaLabel: display };
  }
  const display = `${sign}${rounded.toLocaleString("en-US", {
    maximumFractionDigits: decimals,
    minimumFractionDigits: 0,
  })}`;
  return { display, raw: toRaw(value), ariaLabel: display };
}

export function formatPercent(value: number | null | undefined): FormatResult {
  if (value == null || !Number.isFinite(value)) {
    return { display: PLACEHOLDER, raw: "", ariaLabel: "no data" };
  }
  if (Object.is(value, -0) || Math.abs(value) < Number.EPSILON * 10) {
    return { display: "0.00%", raw: "0", ariaLabel: "0.00%" };
  }
  const display = `${value.toFixed(1)}%`;
  return { display, raw: toRaw(value), ariaLabel: display };
}
