"use client";

import { formatFiat, formatPercent, formatTokenAmount } from "../format-number";

export interface WalletSnapshot {
  network: string;
  wallet: string;
  eth: string;
  usdc: string;
  scope?: string;
  notInspected?: string;
  block?: string;
  disclaimer?: string;
  priceUsd?: number;
  hourly?: Array<{ ts: number; close: number }>;
}

function shortWallet(value: string): string {
  if (value.length <= 20) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function TokenGlyph({ symbol }: { symbol: "ETH" | "USDC" }) {
  const fill = symbol === "ETH" ? "var(--custodia-text)" : "var(--custodia-soft)";
  return (
    <svg className="wallet-card__glyph" viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill={fill} />
      {symbol === "ETH" ? (
        <path
          fill="var(--custodia-accent-ink)"
          d="M16 5.5 8.8 16.2 16 20.4l7.2-4.2L16 5.5Zm0 16.4-7.2-4.2L16 26.5l7.2-8.8-7.2 4.2Z"
        />
      ) : (
        <text x="16" y="21" textAnchor="middle" fill="var(--custodia-accent-ink)" fontSize="13" fontWeight="700">
          $
        </text>
      )}
    </svg>
  );
}

function Sparkline({ values, pair, price }: { values: number[]; pair: string; price: number }) {
  if (values.length < 2) return null;
  const width = 320;
  const height = 72;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const spread = Math.max(high - low, high * 0.001, 0.01);
  const x = (index: number) => (index / (values.length - 1)) * width;
  const y = (value: number) => ((high - value) / spread) * (height - 8) + 4;
  const line = values
    .map((value, index) => `${x(index).toFixed(2)},${y(value).toFixed(2)}`)
    .join(" ");
  const last = values.at(-1) ?? price;
  const first = values[0] ?? last;
  const changePct = first === 0 ? 0 : ((last - first) / first) * 100;
  const change = formatPercent(changePct);
  const priceFmt = formatFiat(last, "detailed");
  const up = changePct >= 0;

  return (
    <figure className="wallet-card__chart">
      <div className="wallet-card__chart-head">
        <span>{pair} · 7d</span>
        <strong className="wallet-num" title={priceFmt.raw || undefined}>
          {priceFmt.display}
        </strong>
        <span className={up ? "wallet-card__delta wallet-card__delta--up" : "wallet-card__delta"}>
          {up ? "+" : ""}
          {change.display}
        </span>
      </div>
      <svg
        className="wallet-card__spark"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${pair} hourly closes`}
      >
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </figure>
  );
}

export function BalanceCard({
  network,
  wallet,
  eth,
  usdc,
  scope,
  notInspected,
  block,
  disclaimer,
  priceUsd,
  hourly,
}: WalletSnapshot) {
  const ethAmount = Number(eth);
  const usdcAmount = Number(usdc);
  const ethUsd = Number.isFinite(ethAmount) && priceUsd ? ethAmount * priceUsd : null;
  const usdcUsd = Number.isFinite(usdcAmount) ? usdcAmount : null;
  const totalUsd =
    ethUsd != null && usdcUsd != null && Number.isFinite(ethUsd + usdcUsd)
      ? ethUsd + usdcUsd
      : null;
  const ethShare = totalUsd && totalUsd > 0 && ethUsd != null ? (ethUsd / totalUsd) * 100 : null;
  const usdcShare = ethShare == null ? null : 100 - ethShare;
  const totalFmt = formatFiat(totalUsd, "detailed");
  const ethAmt = formatTokenAmount(ethAmount, priceUsd);
  const usdcAmt = formatTokenAmount(usdcAmount, 1);
  const ethFiat = formatFiat(ethUsd, "compact");
  const usdcFiat = formatFiat(usdcUsd, "compact");
  const closes = hourly?.slice(-168).map((point) => point.close) ?? [];

  return (
    <section className="wallet-card" aria-label="Wallet snapshot">
      <header className="wallet-card__head">
        <div>
          <span className="wallet-card__network">{network}</span>
          <h4 className="wallet-card__title">{shortWallet(wallet)}</h4>
        </div>
        {block && <span className="wallet-card__block">Block {block}</span>}
      </header>

      <p className="wallet-card__total">
        <span className="wallet-card__total-label">Simulated value</span>
        <strong className="wallet-num" title={totalFmt.raw || undefined}>
          {totalFmt.display}
        </strong>
        <small>Mainnet reference prices · test tokens have no cash value</small>
      </p>

      {ethShare != null && usdcShare != null && (
        <div
          className="wallet-card__mix"
          role="img"
          aria-label={`Allocation ${formatPercent(ethShare).display} ETH, ${formatPercent(usdcShare).display} USDC`}
        >
          <span className="wallet-card__mix-eth" style={{ width: `${ethShare}%` }} />
          <span className="wallet-card__mix-usdc" style={{ width: `${usdcShare}%` }} />
        </div>
      )}

      {closes.length > 1 && priceUsd != null && (
        <Sparkline values={closes} pair="ETH/USDC" price={priceUsd} />
      )}

      <ul className="wallet-card__tokens">
        <li>
          <TokenGlyph symbol="ETH" />
          <div>
            <strong>ETH</strong>
            <span>Ether</span>
          </div>
          <div className="wallet-card__token-amt">
            <strong className="wallet-num" title={ethAmt.raw || undefined}>
              {ethAmt.display}
            </strong>
            <span className="wallet-num" title={ethFiat.raw || undefined}>
              {ethFiat.display}
            </span>
          </div>
        </li>
        <li>
          <TokenGlyph symbol="USDC" />
          <div>
            <strong>USDC</strong>
            <span>USD Coin</span>
          </div>
          <div className="wallet-card__token-amt">
            <strong className="wallet-num" title={usdcAmt.raw || undefined}>
              {usdcAmt.display}
            </strong>
            <span className="wallet-num" title={usdcFiat.raw || undefined}>
              {usdcFiat.display}
            </span>
          </div>
        </li>
      </ul>

      <p className="wallet-card__note">
        {scope ??
          "Inspected: Sepolia ETH and Circle test USDC. Other tokens, chains, lending, and liquidity were not inspected."}
        {notInspected ? ` Not inspected: ${notInspected}` : null}
        {disclaimer ? ` ${disclaimer}` : null}
      </p>
    </section>
  );
}
