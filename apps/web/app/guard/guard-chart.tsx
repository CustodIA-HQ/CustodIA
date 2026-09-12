import type { MarketContext } from "@custodia/schema";
import { formatFiat, formatTokenAmount } from "../format-number";
import {
  CHART_LAYOUT,
  type ChartOverlay,
  type ChartRange,
  chartScale,
  hoursForRange,
} from "../ux/chart-overlays";

const USD_QUOTES = new Set(["USDC", "USDT", "DAI"]);

const formatPrice = (value: number, quote?: string): string => {
  if (!quote || USD_QUOTES.has(quote)) {
    return formatFiat(value, value >= 1_000 ? "compact" : "detailed").display;
  }
  return `${formatTokenAmount(value, undefined, "detailed").display} ${quote}`;
};

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
  const overlayRows = overlays ?? [];
  const requestedHours = hoursForRange(range);
  const scale = chartScale(
    market.hourly,
    range,
    overlayRows.map((row) => row.priceUsd),
  );
  const { points, high, spread, innerHeight, x, y } = scale;
  if (points.length === 0) {
    return (
      <figure className="guard-chart">
        <p className="guard-page__muted">No hourly series to chart.</p>
      </figure>
    );
  }
  const chartWidth = CHART_LAYOUT.width;
  const chartHeight = CHART_LAYOUT.height;
  const padding = CHART_LAYOUT.padding;
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

  return (
    <figure className="guard-chart">
      <div className="guard-chart__heading">
        <div>
          <p className="guard-card__eyebrow">
            {source === "sample" ? "Sample market context" : "Live market context"}
          </p>
          <h4>{market.pair}</h4>
        </div>
        <div className="guard-chart__latest">
          <strong>{formatPrice(last?.close ?? market.priceUsd, market.quote)}</strong>
          <span>{coverage}</span>
        </div>
      </div>
      <svg className="guard-chart__svg" role="img" viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
        <title>{`${market.pair} ${range} hourly closes from The Graph`}</title>
        <defs>
          <linearGradient id="custodia-price-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#00d4b4" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#00d4b4" stopOpacity="0" />
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
                y1={gridY}
                y2={gridY}
                className="guard-chart__grid"
              />
              <text x={padding.left} y={gridY - 5} className="guard-chart__axis">
                {formatPrice(gridValue, market.quote)}
              </text>
            </g>
          );
        })}
        <polygon points={area} fill="url(#custodia-price-fill)" />
        <polyline points={line} className="guard-chart__line" />
        <circle
          cx={x(points.length - 1)}
          cy={y(last?.close ?? market.priceUsd)}
          r="4"
          className="guard-chart__dot"
        />
        {floor && (
          <g className="guard-chart__overlay" data-overlay="floor">
            <line
              x1={padding.left}
              x2={chartWidth - padding.right}
              y1={y(floor.priceUsd)}
              y2={y(floor.priceUsd)}
              className="guard-chart__floor"
            />
            <text
              x={chartWidth - padding.right}
              y={y(floor.priceUsd) - 6}
              className="guard-chart__overlay-label"
              textAnchor="end"
            >
              {floor.label}
            </text>
          </g>
        )}
        {envelope && (
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
        {notional && (
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
      </svg>
      {overlayRows.length > 0 && (
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
            : "—"}
        </span>
        <span>
          {last
            ? new Date(last.ts * 1_000).toLocaleString([], {
                month: "short",
                day: "numeric",
                hour: "numeric",
              })
            : "—"}
        </span>
      </div>
    </figure>
  );
}
