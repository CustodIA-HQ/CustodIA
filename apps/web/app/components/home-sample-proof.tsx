import type { MarketContext, UISpec } from "@custodia/schema";
import { formatFiat, formatPercent } from "../format-number";
import GuardChart from "../guard/guard-chart";
import { PayoffChart } from "./payoff-chart";

export function HomeSampleProof({ spec, market }: { spec: UISpec; market: MarketContext }) {
  const chart = spec.components.find((component) => component.type === "price_chart");
  const knobs = spec.components.find((component) => component.type === "protection_knobs");
  const payoff = spec.components.find((component) => component.type === "payoff_chart");
  const protection = spec.components.find(
    (component) => component.type === "protection_simulation",
  );
  const riskSummary = spec.components.find((component) => component.type === "risk_summary");

  return (
    <section className="home-sample" aria-label="Sample generated protection interface">
      <p className="home-sample__label">Sample · alice.custodia.eth/demo/position-protection</p>

      <div className="home-sample__charts">
        {chart?.type === "price_chart" && <GuardChart market={market} range={chart.range} />}
        {payoff?.type === "payoff_chart" && (
          <PayoffChart
            spotUsd={payoff.spotUsd}
            strikeUsd={payoff.strikeUsd}
            premiumUsd={payoff.premiumUsd}
            points={payoff.points}
            base={market.base ?? "ETH"}
          />
        )}
      </div>

      <div className="home-sample__context">
        {knobs?.type === "protection_knobs" && (
          <section className="guard-page__details">
            <p className="guard-card__eyebrow">Three knobs</p>
            <h2>Position protection</h2>
            <div className="guard-boundaries">
              <div className="guard-boundary">
                <span>Deductible</span>
                <strong>
                  Protect if {market.base ?? "ETH"} falls more than{" "}
                  {formatPercent(knobs.deductiblePct).display}
                </strong>
              </div>
              <div className="guard-boundary">
                <span>Duration</span>
                <strong>{knobs.durationDays} days</strong>
              </div>
              <div className="guard-boundary">
                <span>Budget</span>
                <strong>{formatFiat(knobs.budgetUsd, "detailed").display} maximum</strong>
              </div>
            </div>
            <p className="guard-page__muted">
              Below the deductible the protected line flattens. Above it you keep market movement
              minus the protection cost. This is a model estimate, not a venue quote, and not an
              insurance contract.
            </p>
          </section>
        )}
        {protection?.type === "protection_simulation" && (
          <p className="guard-page__muted">
            Protection cost {formatFiat(protection.premiumEstimateUsd, "compact").display} is a
            model estimate, not a venue quote, and not an insurance contract.
          </p>
        )}
        {riskSummary?.type === "risk_summary" && (
          <p className="guard-page__muted">{riskSummary.risk.explanation}</p>
        )}
      </div>
    </section>
  );
}
