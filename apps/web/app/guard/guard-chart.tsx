import type { MarketContext } from "@custodia/schema";

const formatUsd = (value: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 1_000 ? 0 : 2,
  }).format(value);

export default function GuardChart({
  market,
  range,
}: {
  market: Pick<MarketContext, "pair" | "priceUsd" | "hourly">;
  range: "24h" | "7d";
}) {
  const requestedHours = range === "7d" ? 7 * 24 : 24;
  const points = market.hourly.slice(-requestedHours);
  const values = points.map((point) => point.close);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const spread = Math.max(high - low, high * 0.001, 0.01);
  const chartWidth = 720;
  const chartHeight = 250;
  const padding = { top: 20, right: 18, bottom: 28, left: 18 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const x = (index: number) =>
    padding.left +
    (points.length === 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
  const y = (value: number) => padding.top + ((high - value) / spread) * innerHeight;
  const line = points
    .map((point, index) => `${x(index).toFixed(2)},${y(point.close).toFixed(2)}`)
    .join(" ");
  const area = `${padding.left},${chartHeight - padding.bottom} ${line} ${x(points.length - 1)},${chartHeight - padding.bottom}`;
  const first = points[0];
  const last = points.at(-1);
  const coverage =
    points.length >= requestedHours ? `${range} history` : `${points.length} hourly closes`;

  return (
    <figure className="guard-chart">
      <div className="guard-chart__heading">
        <div>
          <p className="guard-card__eyebrow">Live market context</p>
          <h4>{market.pair}</h4>
        </div>
        <div className="guard-chart__latest">
          <strong>{formatUsd(last?.close ?? market.priceUsd)}</strong>
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
                {formatUsd(gridValue)}
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
      </svg>
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
