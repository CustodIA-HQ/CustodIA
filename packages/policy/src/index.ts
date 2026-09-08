import type { Constraint, Mandate, PolicyDecision, ProposedAction } from "@custodia/schema";

/**
 * Prototype budget: the agent may spend at most this much HBAR per task
 * through the x402 rail before the policy engine refuses. A fixed constant for
 * v0 — a per-mandate configured budget is a later iteration.
 */
export const X402_MAX_HBAR_PER_TASK = 1;

export interface PolicyState {
  /** Cumulative spend so far, in USD (sum of receipts — never a counter). */
  spentUsd: number;
  /** Current unix time in seconds. */
  now: number;
}

const deny = (reason: string, violated?: Constraint["type"]): PolicyDecision => ({
  allowed: false,
  reason,
  violated,
});

const allow = (reason: string): PolicyDecision => ({ allowed: true, reason });

/**
 * The trust boundary. Pure, synchronous, no I/O.
 *
 * Checks, in order:
 *   1. expiry (and not-yet-active) — the mandate's time window
 *   2. asset allowlist          — rebalance may only move allowed assets
 *   3. allow_rebalance          — an explicit veto on rebalancing
 *   4. max_trade_usd            — single-trade ceiling
 *   5. max_notional_usd         — cumulative ceiling via state.spentUsd
 *   6. pay_x402 budget          — fixed HBAR budget per task
 *
 * "The agent proposes, the human authorizes the boundary, the policy engine
 * enforces it." Every denial names the violated constraint so the caller can
 * show the refusal moment to the human.
 */
export function evaluate(
  mandate: Mandate,
  action: ProposedAction,
  state: PolicyState,
): PolicyDecision {
  if (state.now > mandate.exp) {
    return deny(`Mandate expired at ${mandate.exp} (now ${state.now})`);
  }
  if (state.now < mandate.iat) {
    return deny(`Mandate not active until ${mandate.iat} (now ${state.now})`);
  }

  if (action.kind === "pay_x402") {
    if (action.amountHbar > X402_MAX_HBAR_PER_TASK) {
      return deny(
        `HBAR payment ${action.amountHbar} exceeds the prototype budget of ${X402_MAX_HBAR_PER_TASK} HBAR per task`,
      );
    }
    return allow(`x402 payment of ${action.amountHbar} HBAR within the prototype budget`);
  }

  // rebalance
  const allowedAssets = findConstraint(mandate, "custodia.allowed_assets.1");
  if (
    allowedAssets &&
    (!allowedAssets.assets.includes(action.fromAsset) ||
      !allowedAssets.assets.includes(action.toAsset))
  ) {
    return deny(
      `Asset pair ${action.fromAsset}→${action.toAsset} is outside the allowed list [${allowedAssets.assets.join(", ")}]`,
      allowedAssets.type,
    );
  }

  const allowRebalance = findConstraint(mandate, "custodia.allow_rebalance.1");
  if (allowRebalance && !allowRebalance.value) {
    return deny("Rebalancing is not permitted by this mandate", allowRebalance.type);
  }

  const maxTrade = findConstraint(mandate, "custodia.max_trade_usd.1");
  if (maxTrade && action.notionalUsd > maxTrade.value) {
    return deny(
      `Trade of $${action.notionalUsd.toLocaleString("en-US")} exceeds max_trade_usd of $${maxTrade.value.toLocaleString("en-US")}`,
      maxTrade.type,
    );
  }

  const maxNotional = findConstraint(mandate, "custodia.max_notional_usd.1");
  const projected = state.spentUsd + action.notionalUsd;
  if (maxNotional && projected > maxNotional.value) {
    return deny(
      `Cumulative spend of $${projected.toLocaleString("en-US")} ($${state.spentUsd.toLocaleString("en-US")} spent + $${action.notionalUsd.toLocaleString("en-US")}) exceeds max_notional_usd of $${maxNotional.value.toLocaleString("en-US")}`,
      maxNotional.type,
    );
  }

  return allow(
    `Permitted: ${action.fromAsset}→${action.toAsset} $${action.notionalUsd.toLocaleString("en-US")} is within every mandate constraint`,
  );
}

const findConstraint = <T extends Constraint["type"]>(
  mandate: Mandate,
  type: T,
): Extract<Constraint, { type: T }> | undefined =>
  mandate.constraints.find((c) => c.type === type) as Extract<Constraint, { type: T }> | undefined;
