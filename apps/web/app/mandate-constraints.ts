import type { Constraint, UISpec } from "@custodia/schema";

/**
 * The constraints a mandate carries, derived from the proposal's UI spec —
 * the platform's typed components, never free text from the model. Shared by
 * web chat and the task page so a mandate signed anywhere means the same.
 */
export const constraintsFor = (
  spec: UISpec,
  overrides: { allowRebalance?: boolean; targetEthPct?: number } = {},
): Constraint[] => {
  const allocation = spec.components.find((component) => component.type === "allocation_selector");
  const drawdown = spec.components.find((component) => component.type === "range_slider");
  const tradeSize = spec.components.find((component) => component.type === "amount_selector");
  const rebalance = spec.components.find((component) => component.type === "permission_toggle");
  const knobs = spec.components.find((component) => component.type === "protection_knobs");
  const preview = spec.components.find((component) => component.type === "execution_preview");
  const leverage = spec.components.find((component) => component.type === "leverage_control");
  const health = spec.components.find((component) => component.type === "health_meter");
  const constraints: Constraint[] = [
    {
      type: "custodia.allowed_assets.1",
      assets: allocation?.type === "allocation_selector" ? [...allocation.assets] : ["ETH", "USDC"],
    },
  ];
  if (drawdown?.type === "range_slider") {
    constraints.push({ type: "custodia.max_drawdown_pct.1", value: drawdown.max });
  }
  if (tradeSize?.type === "amount_selector") {
    constraints.push({ type: "custodia.max_trade_usd.1", value: tradeSize.max });
  }
  if (rebalance?.type === "permission_toggle") {
    constraints.push({
      type: "custodia.allow_rebalance.1",
      value: overrides.allowRebalance ?? rebalance.default,
    });
  }
  if (overrides.targetEthPct !== undefined) {
    constraints.push({ type: "custodia.target_eth_pct.1", value: overrides.targetEthPct });
  }
  if (knobs?.type === "protection_knobs") {
    constraints.push(
      { type: "custodia.deductible_pct.1", value: knobs.deductiblePct },
      { type: "custodia.duration_days.1", value: knobs.durationDays },
      { type: "custodia.max_premium_usd.1", value: knobs.budgetUsd },
    );
  }
  if (preview?.type === "execution_preview") {
    constraints.push(
      { type: "custodia.max_trade_usd.1", value: preview.notionalUsd },
      { type: "custodia.max_slippage_bps.1", value: preview.slippageBps },
    );
  }
  if (leverage?.type === "leverage_control") {
    constraints.push(
      { type: "custodia.max_leverage.1", value: leverage.enabled ? leverage.maxLeverage : 1 },
      { type: "custodia.require_stop.1", value: leverage.stopRequired },
    );
  }
  if (health?.type === "health_meter") {
    constraints.push({ type: "custodia.min_health_factor.1", value: health.threshold });
  }
  return constraints;
};
