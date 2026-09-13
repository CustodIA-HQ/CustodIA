"use client";

import type { MarketContext } from "@custodia/schema";
import { formatFiat, formatPercent, formatTokenAmount } from "../format-number";
import { isCompact, layoutForWidth, tooltipSide } from "../ux/chart-geometry";
import {
  type ChartOverlay,
  type ChartRange,
  chartScale,
  hoursForRange,
} from "../ux/chart-overlays";
import { useChartScrub, useContainerWidth } from "../ux/use-chart-scrub";

const USD_QUOTES = new Set(["USDC", "USDT", "DAI"]);

const formatPrice = (value: number, quote?: string, mode?: "compact" | "detailed"): string => {
  if (!quote || USD_QUOTES.has(quote)) {
    return formatFiat(value, mode ?? (value >= 1_000 ? "compact" : "detailed")).display;
  }
  return `${formatTokenAmount(value, undefined, "detailed").display} ${quote}`;
};

/** Axis ticks compact to "$2.5K" only when the visible range is wide enough to tell ticks apart. */
const axisMode = (high: number, spread: number): "compact" | "detailed" =>
  high > 0 && spread / high < 0.03 ? "detailed" : "compact";

const formatWhen = (ts: number, withTime = true): string =>
  new Date(ts * 1_000).toLocaleString([], {
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric" } : {}),
  });

/**
 * Hourly close line with a floor/envelope/trade overlay set. Interactive by
 * default: drag or tap to scrub (touch), hover (mouse), arrow keys (keyboard).
 * Laid out in CSS pixels for the measured width so labels stay legible on a
 * phone; below COMPACT_WIDTH the overlay labels move into the key.
 */
export default function GuardChart({
  market,
  range,
  overlays,
  source,
}: {
  market: Pick<MarketContext, "pair" | "priceUsd" | "hourly"> & { quote?: string };
  range: ChartRange;
  overlays?: ChartOverlay[];
  source?: "live" | "sample";
}) {
  const { ref, width } = useContainerWidth<HTMLDivElement>();
  const layout = layoutForWidth(width);
  const compact = isCompact(layout);
  const overlayRows = overlays ?? [];
  const requestedHours = hoursForRange(range);
  const scale = chartScale(
    market.hourly,
    range,
    overlayRows.map((row) => row.priceUsd),
    layout,
  );
  const { points, high, spread, innerHeight, x, y } = scale;
  const scrub = useChartScrub(points.length, layout);

  if (points.length === 0) {
    return (
      <figure className="guard-chart">
        <p className="guard-page__muted">No hourly series to chart.</p>
      </figure>
    );
  }

  const { width: chartWidth, height: chartHeight, padding } = layout;
  const line = points
    .map((point, index) => `${x(index).toFixed(2)},${y(point.close).toFixed(2)}`)
    .join(" ");
  const area = `${padding.left},${chartHeight - padding.bottom} ${line} ${x(points.length - 1)},${chartHeight - padding.bottom}`;
  const first = points[0];
  const last = points.at(-1);
  const coverage =
    points.length >= requestedHours ? `${range} history` : `${points.length} hourly closes`;
  const floor = overlayRows.find((row) => row.id === "floor");
  const envelope = overlayRows.find((row) => row.id === "envelope");
  const notional = overlayRows.find((row) => row.id === "notional");

  const hovered = scrub.index === null ? null : points[scrub.index];
  const hoveredX = scrub.index === null ? 0 : x(scrub.index);
  const hoveredY = hovered ? y(hovered.close) : 0;
  const side = tooltipSide(hoveredX, layout);
  const vsFloor =
    hovered && floor && floor.priceUsd > 0
      ? ((hovered.close - floor.priceUsd) / floor.priceUsd) * 100
      : null;
  const headline = hovered ?? last;

  return (
    <figure className="guard-chart">
      <div className="guard-chart__heading">
        <div>
          <p className="guard-card__eyebrow">
            {source === "sample" ? "Sample market context" : "Live market context"}
          </p>
          <h4>{market.pair}</h4>
        </div>
        <div className="guard-chart__latest" aria-live="polite">
          <strong>{formatPrice(headline?.close ?? market.priceUsd, market.quote)}</strong>
          <span>{hovered ? formatWhen(hovered.ts) : coverage}</span>
        </div>
      </div>
      <svg className="guard-chart__svg" role="img" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        <title>{`${market.pair} ${range} hourly closes from The Graph`}</title>
        <defs>
          <linearGradient id="custodia-price-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--custodia-accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--custodia-accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((ratio) => {
          const gridY = padding.top + ratio * innerHeight;
          const gridValue = high - ratio * spread;
          return (
            <g key={ratio}>
              <line
                x1={padding.left}
                x2={chartWidth - padding.right}
                y1={y(floor.priceUsd)}
                y2={y(floor.priceUsd)}
                className="guard-chart__floor"
              />
              {!compact && (
                <text
                  x={chartWidth - padding.right}
                  y={y(floor.priceUsd) - 6}
                  className="guard-chart__overlay-label"
                  textAnchor="end"
                >
                  {floor.label}
                </text>
              )}
            </g>
          )}
          {!compact && envelope && (
            <text
              x={envelope.x}
              y={Math.max(padding.top + 12, y(envelope.priceUsd) - 14)}
              className="guard-chart__overlay-label guard-chart__overlay-label--envelope"
              textAnchor="end"
              data-overlay="envelope"
            >
              {envelope.label}
            </text>
          )}
          {!compact && notional && (
            <text
              x={notional.x}
              y={Math.min(
                chartHeight - padding.bottom - 4,
                y(notional.priceUsd) + (notional.outside ? 28 : 18),
              )}
              className={
                notional.outside
                  ? "guard-chart__overlay-label guard-chart__overlay-label--outside"
                  : "guard-chart__overlay-label"
              }
              textAnchor="end"
              data-overlay="notional"
            >
              {notional.label}
            </text>
          )}
          {hovered ? (
            <g className="guard-chart__crosshair">
              <line
                x1={hoveredX}
                x2={hoveredX}
                y1={padding.top}
                y2={chartHeight - padding.bottom}
                className="guard-chart__hairline"
              />
              <circle cx={hoveredX} cy={hoveredY} r="7" className="guard-chart__ring" />
              <circle cx={hoveredX} cy={hoveredY} r="4" className="guard-chart__dot" />
            </g>
          ) : (
            <circle
              cx={x(points.length - 1)}
              cy={y(last?.close ?? market.priceUsd)}
              r="4"
              className="guard-chart__dot"
            />
          )}
        </svg>
        {hovered && (
          <output
            className={`guard-chart__tooltip guard-chart__tooltip--${side}`}
            style={{
              left: `${(hoveredX / chartWidth) * 100}%`,
              top: `${(hoveredY / chartHeight) * 100}%`,
            }}
          >
            <strong>{formatPrice(hovered.close, market.quote)}</strong>
            <span>{formatWhen(hovered.ts)}</span>
            {vsFloor !== null && (
              <span className={vsFloor < 0 ? "guard-chart__tooltip-bad" : undefined}>
                {vsFloor >= 0 ? "+" : ""}
                {formatPercent(vsFloor).display} vs floor
              </span>
            )}
          </output>
        )}
      </div>

      {(overlayRows.length > 0 || compact) && (
        <ul className="guard-chart__key">
          {floor && (
            <li data-key="floor">
              <span className="guard-chart__swatch guard-chart__swatch--floor" />
              {floor.label}
            </li>
          )}
          {envelope && (
            <li data-key="envelope">
              <span className="guard-chart__swatch guard-chart__swatch--envelope" />
              {envelope.label}
            </li>
          )}
          {notional && (
            <li data-key="notional">
              <span
                className={
                  notional.outside
                    ? "guard-chart__swatch guard-chart__swatch--outside"
                    : "guard-chart__swatch"
                }
              />
              {notional.label}
            </li>
          )}
          {compact && (
            <li className="guard-chart__hint" data-key="hint">
              Touch and drag the chart to read prices
            </li>
          )}
        </ul>
      )}
      <div className="guard-chart__dates">
        <span>
          {first
            ? new Date(first.ts * 1_000).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "numeric",
              })
            : "-"}
        </span>
        <span>
          {last
            ? new Date(last.ts * 1_000).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "numeric",
              })
            : "-"}
        </span>
      </div>
    </figure>
  );
}
