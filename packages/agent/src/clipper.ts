import type { RiskContext, UISpec } from "@custodia/schema";

/**
 * Clip agent-supplied bounds to the risk context BEFORE the spec is accepted.
 *
 * The LLM can never pick its own risk numbers: drawdown sliders are pinned to
 * the deterministic `drawdownRange` from the risk service, and the trade
 * envelope is capped at `maxTradeEnvelopeUsd`. This runs server-side in the
 * emit_ui_spec tool so an out-of-policy bound becomes a clipped value, not a
 * rejected spec.
 */
export function clipUISpec(spec: UISpec, risk: RiskContext): UISpec {
  return {
    ...spec,
    components: spec.components.map((component) => {
      switch (component.type) {
        case "range_slider": {
          const [lo, hi] = risk.drawdownRange;
          const range = Math.max(hi - lo, 0.01);
          const min = lo;
          const max = Math.max(hi, min + range);
          return {
            ...component,
            min,
            max,
            default: clamp(component.default, min, max),
          };
        }
        case "amount_selector": {
          const max = Math.min(component.max, risk.maxTradeEnvelopeUsd);
          const min = Math.min(component.min, max);
          return {
            ...component,
            min,
            max,
            default: clamp(component.default, min, max),
          };
        }
        case "protection_knobs": {
          const [lo, hi] = risk.drawdownRange;
          const deductiblePct = clamp(
            component.deductiblePct,
            Math.max(1, lo),
            Math.max(hi, lo + 1),
          );
          const budgetUsd = Math.min(component.budgetUsd, Math.max(1, risk.maxTradeEnvelopeUsd));
          const strikeUsd = component.spotUsd * (1 - deductiblePct / 100);
          return { ...component, deductiblePct, budgetUsd, strikeUsd };
        }
        default:
          return component;
      }
    }),
  };
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
