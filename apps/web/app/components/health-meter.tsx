import { formatPercent } from "../format-number";

export function HealthMeter({
  current,
  threshold,
  liquidation,
  utilizationPct,
}: {
  current: number;
  threshold: number;
  liquidation: number;
  utilizationPct: number;
}) {
  const max = Math.max(current, threshold, 2);
  const pct = (value: number) => `${Math.min(100, Math.max(0, (value / max) * 100)).toFixed(1)}%`;
  // Aave dashboard bands: green at HF ≥ 3, red below 1.1, warning in between.
  const tone = current < 1.1 ? "danger" : current >= 3 ? "ok" : "warn";
  const shown = Math.floor(current * 100) / 100;

  return (
    <section className="health-meter" aria-label="Collateral health">
      <p className="guard-card__eyebrow">Collateral health</p>
      <div className="health-meter__head">
        <h2>
          Health factor{" "}
          <strong className={`health-meter__value health-meter__value--${tone}`}>
            {shown.toFixed(2)}
          </strong>
        </h2>
        <p>
          Liquidation at &lt;1.0. The agent pauses new risk at {threshold.toFixed(2)}. Estimated
          utilization {formatPercent(utilizationPct).display} is a model figure, not an Aave field.
        </p>
      </div>
      <div
        className="health-meter__track"
        role="img"
        aria-label={`Health factor ${shown.toFixed(2)}`}
      >
        <span className="health-meter__fill" style={{ width: pct(current) }} />
        <span
          className="health-meter__mark"
          style={{ left: pct(liquidation) }}
          title="Liquidation"
        />
        <span
          className="health-meter__mark health-meter__mark--threshold"
          style={{ left: pct(threshold) }}
          title="Pause"
        />
      </div>
      <p className="guard-page__muted">
        Model estimate from concentration and realized volatility — not a live lending position.
        Health factor below 1 is liquidatable in Aave-style markets.
      </p>
    </section>
  );
}
