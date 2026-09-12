import { formatFiat } from "../format-number";

export type PayoffPoint = {
  priceUsd: number;
  unprotectedUsd: number;
  protectedUsd: number;
};

export function PayoffChart({
  spotUsd,
  strikeUsd,
  premiumUsd,
  points,
  base = "ETH",
}: {
  spotUsd: number;
  strikeUsd: number;
  premiumUsd: number;
  points: PayoffPoint[];
  base?: string;
}) {
  if (points.length < 2) return null;
  const values = points.flatMap((point) => [point.unprotectedUsd, point.protectedUsd]);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const spread = Math.max(high - low, 1);
  const width = 720;
  const height = 260;
  const padding = { top: 18, right: 16, bottom: 32, left: 18 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const x = (index: number) => padding.left + (index / (points.length - 1)) * innerWidth;
  const y = (value: number) => padding.top + ((high - value) / spread) * innerHeight;
  const unprotected = points
    .map((point, index) => `${x(index).toFixed(2)},${y(point.unprotectedUsd).toFixed(2)}`)
    .join(" ");
  const protectedLine = points
    .map((point, index) => `${x(index).toFixed(2)},${y(point.protectedUsd).toFixed(2)}`)
    .join(" ");
  const zeroY = y(0);
  const floor = formatFiat(strikeUsd, "detailed").display;
  const cost = formatFiat(premiumUsd, "compact").display;

  return (
    <figure className="guard-chart">
      <div className="guard-chart__heading">
        <div>
          <p className="guard-card__eyebrow">What happens in each scenario</p>
          <h4>
            {base} with protection vs {base} alone
          </h4>
        </div>
        <div className="guard-chart__latest">
          <strong>Floor {floor}</strong>
          <span>Protection cost {cost}</span>
        </div>
      </div>
      <svg className="guard-chart__svg" role="img" viewBox={`0 0 ${width} ${height}`}>
        <title>
          {`Protected ${base} floors losses below the deductible; upside still follows the market minus the protection cost.`}
        </title>
        <line
          x1={padding.left}
          x2={width - padding.right}
          y1={zeroY}
          y2={zeroY}
          className="guard-chart__grid"
        />
        <polyline points={unprotected} className="payoff-chart__unprotected" />
        <polyline points={protectedLine} className="payoff-chart__protected" />
      </svg>
      <div className="guard-chart__dates">
        <span>
          {base} {formatFiat(spotUsd, "compact").display} now
        </span>
        <span className="payoff-chart__legend">
          <span className="payoff-chart__swatch payoff-chart__swatch--raw" aria-hidden />{" "}
          Unprotected
          <span className="payoff-chart__swatch payoff-chart__swatch--floor" aria-hidden /> With
          protection
        </span>
      </div>
    </figure>
  );
}
