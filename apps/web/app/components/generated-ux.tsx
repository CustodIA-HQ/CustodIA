import type { MarketContext, UISpec } from "@custodia/schema";
import { formatFiat, formatPercent } from "../format-number";
import GuardChart from "../guard/guard-chart";
import { HealthMeter } from "./health-meter";
import { PayoffChart } from "./payoff-chart";

export function GeneratedUx({
  spec,
  market,
  hideChart = false,
}: {
  spec: UISpec;
  market?: MarketContext | null;
  hideChart?: boolean;
}) {
  const chart = spec.components.find((component) => component.type === "price_chart");
  const allocation = spec.components.find((component) => component.type === "allocation_selector");
  const drawdown = spec.components.find((component) => component.type === "range_slider");
  const tradeSize = spec.components.find((component) => component.type === "amount_selector");
  const rebalance = spec.components.find((component) => component.type === "permission_toggle");
  const protection = spec.components.find(
    (component) => component.type === "protection_simulation",
  );
  const knobs = spec.components.find((component) => component.type === "protection_knobs");
  const payoff = spec.components.find((component) => component.type === "payoff_chart");
  const health = spec.components.find((component) => component.type === "health_meter");
  const preview = spec.components.find((component) => component.type === "execution_preview");
  const leverage = spec.components.find((component) => component.type === "leverage_control");
  const comparison = spec.components.find((component) => component.type === "strategy_comparison");
  const escalation = spec.components.find((component) => component.type === "human_escalation");
  const riskSummary = spec.components.find((component) => component.type === "risk_summary");

  return (
    <div className="generated-ux">
      {escalation?.type === "human_escalation" && (
        <section className="human-escalation" role="alert">
          <p className="guard-card__eyebrow">Needs a new signature</p>
          <h2>Outside the signed envelope</h2>
          <p>{escalation.reason}</p>
          <p className="guard-page__muted">
            Blocked: {escalation.blockedAction}. The agent cannot widen its own authority.
          </p>
        </section>
      )}

      {chart?.type === "price_chart" && market && !hideChart && (
        <GuardChart market={market} range={chart.range} />
      )}

      {payoff?.type === "payoff_chart" && (
        <PayoffChart
          spotUsd={payoff.spotUsd}
          strikeUsd={payoff.strikeUsd}
          premiumUsd={payoff.premiumUsd}
          points={payoff.points}
          base={market?.base ?? "ETH"}
        />
      )}

      {health?.type === "health_meter" && (
        <HealthMeter
          current={health.current}
          threshold={health.threshold}
          liquidation={health.liquidation}
          utilizationPct={health.utilizationPct}
        />
      )}

      {knobs?.type === "protection_knobs" && (
        <section className="guard-page__details">
          <p className="guard-card__eyebrow">Three knobs</p>
          <h2>Position protection</h2>
          <div className="guard-boundaries">
            <div className="guard-boundary">
              <span>Deductible</span>
              <strong>
                Protect if {market?.base ?? "ETH"} falls more than{" "}
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

      {(allocation || drawdown || tradeSize || rebalance) && (
        <section className="guard-page__details">
          <p className="guard-card__eyebrow">Boundaries</p>
          <h2>The signed guard</h2>
          <div className="guard-boundaries">
            {allocation?.type === "allocation_selector" && (
              <div className="guard-boundary">
                <span>Allocation</span>
                <strong>
                  {allocation.assets
                    .map((asset, index) => `${allocation.defaultPct[index]}% ${asset}`)
                    .join(" / ")}
                </strong>
              </div>
            )}
            {drawdown?.type === "range_slider" && (
              <div className="guard-boundary">
                <span>Maximum drawdown</span>
                <strong>
                  {drawdown.min}%–{drawdown.max}%
                </strong>
              </div>
            )}
            {tradeSize?.type === "amount_selector" && (
              <div className="guard-boundary">
                <span>Maximum trade</span>
                <strong>
                  {formatFiat(tradeSize.min, "compact").display}–
                  {formatFiat(tradeSize.max, "compact").display}
                </strong>
              </div>
            )}
            {rebalance?.type === "permission_toggle" && (
              <div className="guard-boundary">
                <span>Rebalancing</span>
                <strong>{rebalance.default ? "Enabled" : "Disabled by default"}</strong>
              </div>
            )}
          </div>
        </section>
      )}

      {preview?.type === "execution_preview" && (
        <section className="guard-page__details">
          <p className="guard-card__eyebrow">Confirmation preview</p>
          <h2>
            {preview.side === "buy" ? "Buy" : "Sell"} {preview.base} with {preview.quote}
          </h2>
          <div className="guard-boundaries">
            <div className="guard-boundary">
              <span>Size</span>
              <strong>{formatFiat(preview.notionalUsd, "detailed").display}</strong>
            </div>
            <div className="guard-boundary">
              <span>Expected price</span>
              <strong>{formatFiat(preview.expectedPriceUsd, "detailed").display}</strong>
            </div>
            <div className="guard-boundary">
              <span>Slippage from pool depth</span>
              <strong>{(preview.slippageBps / 100).toFixed(2)}%</strong>
            </div>
            <div className="guard-boundary">
              <span>Remaining envelope</span>
              <strong>{formatFiat(preview.remainingMandateUsd, "compact").display}</strong>
            </div>
          </div>
          <p className={preview.verdict === "inside" ? "guard-page__muted" : "chat-error"}>
            {preview.reason}
          </p>
        </section>
      )}

      {leverage?.type === "leverage_control" && (
        <section className="guard-page__details">
          <p className="guard-card__eyebrow">Futures envelope</p>
          <h2>Leverage stays off unless you sign it on</h2>
          <div className="guard-boundaries">
            <div className="guard-boundary">
              <span>Leverage</span>
              <strong>{leverage.enabled ? `${leverage.maxLeverage}x` : "Disabled"}</strong>
            </div>
            <div className="guard-boundary">
              <span>Stop</span>
              <strong>Required</strong>
            </div>
          </div>
          <p className="guard-page__muted">
            Simulated in this build. The agent cannot enable leverage by itself.
          </p>
        </section>
      )}

      {comparison?.type === "strategy_comparison" && (
        <section className="guard-page__details">
          <p className="guard-card__eyebrow">Alternatives</p>
          <h2>
            Current {comparison.currentEthPct}% ETH / {comparison.currentUsdcPct}% USDC
          </h2>
          <ul className="wallet-card__tokens">
            {comparison.candidates.map((candidate) => (
              <li key={`${candidate.ethPct}-${candidate.usdcPct}`}>
                <div>
                  <strong>
                    {candidate.ethPct}% ETH / {candidate.usdcPct}% USDC
                    {candidate.distance === 0 ? " · do nothing" : ""}
                  </strong>
                  <span>
                    {candidate.feasible
                      ? `Trade ${formatFiat(candidate.estTradeUsd, "compact").display}`
                      : candidate.reasons[0]}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {protection?.type === "protection_simulation" && (
        <p className="guard-page__muted">
          Protection cost {formatFiat(protection.premiumEstimateUsd, "compact").display} is a model
          estimate, not a venue quote, and not an insurance contract.
        </p>
      )}
      {riskSummary?.type === "risk_summary" && (
        <p className="guard-page__muted">{riskSummary.risk.explanation}</p>
      )}
    </div>
  );
}
