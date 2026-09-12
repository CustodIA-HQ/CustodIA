"use client";

import { formatFiat } from "../format-number";
import { layoutForWidth, nearestIndex, tooltipSide } from "../ux/chart-geometry";
import { useChartScrub, useContainerWidth } from "../ux/use-chart-scrub";

export type PayoffPoint = {
  priceUsd: number;
  unprotectedUsd: number;
  protectedUsd: number;
};

/**
 * Payoff comparison: protected vs unprotected value across prices. Same scrub
 * interaction as the price chart; the tooltip lists both series at the price.
 */
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
  const { ref, width } = useContainerWidth<HTMLDivElement>();
  const layout = layoutForWidth(width);
  const scrub = useChartScrub(points.length, layout);
  if (points.length < 2) return null;

  const values = points.flatMap((point) => [point.unprotectedUsd, point.protectedUsd]);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const spread = Math.max(high - low, 1);
  const { width: chartWidth, height: chartHeight, padding } = layout;
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
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

  const spotIndex = nearestIndex(
    points.length,
    x(points.findIndex((p) => p.priceUsd >= spotUsd)),
    layout,
  );
  const hovered = scrub.index === null ? null : points[scrub.index];
  const hoveredX = scrub.index === null ? 0 : x(scrub.index);
  const side = tooltipSide(hoveredX, layout);

  return (
    <figure className="guard-chart">
      <div className="guard-chart__heading">
        <div>
          <p className="guard-card__eyebrow">What happens in each scenario</p>
          <h4>
            {base} with protection vs {base} alone
          </h4>
        </div>
        <div className="guard-chart__latest" aria-live="polite">
          <strong>
            {hovered
              ? `${base} at ${formatFiat(hovered.priceUsd, "compact").display}`
              : `Floor ${floor}`}
          </strong>
          <span>{hovered ? "scenario" : `Protection cost ${cost}`}</span>
        </div>
      </div>
      <div
        className="guard-chart__plot"
        ref={ref}
        role="slider"
        tabIndex={0}
        aria-label={`Protected ${base} versus unprotected ${base} across prices`}
        aria-valuemin={0}
        aria-valuemax={points.length - 1}
        aria-valuenow={scrub.index ?? spotIndex}
        aria-valuetext={
          hovered
            ? `At ${formatFiat(hovered.priceUsd, "compact").display}: ${formatFiat(hovered.protectedUsd, "compact").display} protected, ${formatFiat(hovered.unprotectedUsd, "compact").display} unprotected`
            : `Floor ${floor}, protection cost ${cost}`
        }
        onKeyDown={scrub.handlers.onKeyDown}
      >
        <svg
          ref={scrub.svgRef}
          className={
            scrub.index === null ? "guard-chart__svg" : "guard-chart__svg guard-chart__svg--scrub"
          }
          aria-hidden="true"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          width={chartWidth}
          height={chartHeight}
          onPointerDown={scrub.handlers.onPointerDown}
          onPointerMove={scrub.handlers.onPointerMove}
          onPointerUp={scrub.handlers.onPointerUp}
          onPointerLeave={scrub.handlers.onPointerLeave}
        >
          <title>{`Protected ${base} vs unprotected ${base} across prices`}</title>
          <line
            x1={padding.left}
            x2={chartWidth - padding.right}
            y1={zeroY}
            y2={zeroY}
            className="guard-chart__grid"
          />
          <line
            x1={x(spotIndex)}
            x2={x(spotIndex)}
            y1={padding.top}
            y2={chartHeight - padding.bottom}
            className="guard-chart__grid"
          />
          <polyline points={unprotected} className="payoff-chart__unprotected" />
          <polyline points={protectedLine} className="payoff-chart__protected" />
          {hovered && (
            <g className="guard-chart__crosshair">
              <line
                x1={hoveredX}
                x2={hoveredX}
                y1={padding.top}
                y2={chartHeight - padding.bottom}
                className="guard-chart__hairline"
              />
              <circle
                cx={hoveredX}
                cy={y(hovered.unprotectedUsd)}
                r="7"
                className="guard-chart__ring"
              />
              <circle
                cx={hoveredX}
                cy={y(hovered.unprotectedUsd)}
                r="4"
                className="payoff-chart__dot--raw"
              />
              <circle
                cx={hoveredX}
                cy={y(hovered.protectedUsd)}
                r="7"
                className="guard-chart__ring"
              />
              <circle
                cx={hoveredX}
                cy={y(hovered.protectedUsd)}
                r="4"
                className="payoff-chart__dot--floor"
              />
            </g>
          )}
        </svg>
        {hovered && (
          <output
            className={`guard-chart__tooltip guard-chart__tooltip--${side}`}
            style={{
              left: `${(hoveredX / chartWidth) * 100}%`,
              top: `${(y(hovered.protectedUsd) / chartHeight) * 100}%`,
            }}
          >
            <strong>
              <i className="payoff-chart__swatch payoff-chart__swatch--floor" aria-hidden />{" "}
              {formatFiat(hovered.protectedUsd, "compact").display} protected
            </strong>
            <span>
              <i className="payoff-chart__swatch payoff-chart__swatch--raw" aria-hidden />{" "}
              {formatFiat(hovered.unprotectedUsd, "compact").display} unprotected
            </span>
          </output>
        )}
      </div>
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
