import type {
  Constraint,
  Mandate,
  MarketContext,
  PolicyDecision,
  ProposedAction,
} from "@custodia/schema";
import { constraintsHash, MANDATE_DOMAIN, MANDATE_TYPES } from "@custodia/schema";
import { verifyTypedData } from "viem";

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

// ─── Hard policy limits (absolute bounds) ────────────────────────────────────

/**
 * Absolute floor for max_drawdown_pct that the policy engine will ever accept,
 * regardless of what the user signed.  Prevents the LLM from proposing a
 * mandate where a -100 % drawdown (= total loss) is "authorised".
 */
export const POLICY_MAX_DRAWDOWN_FLOOR_PCT = -50 as const;

/**
 * Absolute ceiling for a single trade, in USD, regardless of the mandate.
 * Belt-and-suspenders: even if a user signs max_trade_usd = ∞ this caps it.
 */
export const POLICY_MAX_TRADE_USD_CEILING = 100_000 as const;

/**
 * Market data is considered stale if older than this many seconds.
 * The Graph data is fetched at most this often; refusing to act on older
 * data prevents acting on a snapshot that no longer reflects reality.
 */
export const POLICY_MARKET_STALENESS_SECONDS = 300 as const; // 5 min

// ─── 1. Signature verification ───────────────────────────────────────────────

/**
 * Verifies that `rawSignature` is a valid EIP-712 signature over the mandate
 * object and was produced by the wallet at `expectedOwner`.
 *
 * Pure and synchronous (viem's verifyTypedData is synchronous for EOAs).
 * Returns a `PolicyDecision` so the result is always typed the same way as
 * every other gate in this module.
 *
 * Hard rules:
 *   - Address comparison is case-insensitive (checksummed vs lowercase).
 *   - A mismatch or any viem error → allowed: false. Never throws.
 */
export async function validateMandateSignature(
  mandate: Mandate,
  rawSignature: `0x${string}`,
  expectedOwner: `0x${string}`,
): Promise<PolicyDecision> {
  try {
    // Build the canonical EIP-712 message exactly as MandateRenderer does.
    // constraintsHash guarantees the same bytes32 regardless of constraint order.
    const message = {
      kind: mandate.kind,
      taskId: mandate.taskId,
      owner: mandate.owner,
      agent: mandate.agent,
      ens: mandate.ens,
      constraintsHash: constraintsHash(mandate.constraints),
      iat: BigInt(mandate.iat),
      exp: BigInt(mandate.exp),
    };

    const valid = await verifyTypedData({
      domain: MANDATE_DOMAIN,
      types: MANDATE_TYPES,
      primaryType: "Mandate",
      message,
      signature: rawSignature,
      address: expectedOwner,
    });

    if (!valid) {
      return deny(
        `Signature verification failed: recovered address does not match wallet ${expectedOwner}`,
      );
    }

    return allow(`Signature verified: mandate was signed by ${expectedOwner}`);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return deny(`Signature verification threw an error: ${detail}`);
  }
}

// ─── 2. Risk-limit evaluation against live market data ───────────────────────

/**
 * Market context derived from The Graph (Uniswap V3 / Aave v3) that the
 * policy engine uses to cross-check the mandate's numeric constraints.
 *
 * The engine does NOT trust numbers emitted by the LLM. It re-derives the
 * 24-hour drawdown from the OHLCV data and compares it against the signed
 * mandate to decide whether the constraint is realistic.
 */
export interface MarketSnapshot {
  /** Full market context straight from The Graph cache. */
  market: MarketContext;
  /** Unix timestamp (seconds) at evaluation time — must be passed in for testability. */
  now: number;
}

/**
 * Evaluates the mandate's numeric risk constraints against live market data.
 *
 * Checks, in order:
 *   1. Market data staleness  — refuse to act on an old snapshot.
 *   2. Drawdown floor         — mandate cannot authorise losses below POLICY_MAX_DRAWDOWN_FLOOR_PCT.
 *   3. Trade size ceiling     — mandate cannot authorise trades above POLICY_MAX_TRADE_USD_CEILING.
 *   4. Volatility coherence   — max_drawdown_pct must be ≥ realized 24 h vol (you cannot set a
 *                               drawdown tighter than the market is already moving).
 *
 * All comparisons are against values **in the signed mandate** — the market data
 * is used only to validate that those values are within safe and coherent bounds.
 *
 * Pure and synchronous. No I/O.
 */
export function evaluatePolicyLimits(mandate: Mandate, snapshot: MarketSnapshot): PolicyDecision {
  const { market, now } = snapshot;

  // ── 1. Staleness guard ───────────────────────────────────────────────────
  const ageSeconds = now - market.fetchedAt;
  if (ageSeconds > POLICY_MARKET_STALENESS_SECONDS) {
    return deny(
      `Market data is stale: fetched ${ageSeconds}s ago (max allowed: ${POLICY_MARKET_STALENESS_SECONDS}s). ` +
        "Refresh The Graph snapshot before evaluating.",
    );
  }

  // ── 2. Drawdown floor (absolute policy bound) ────────────────────────────
  const drawdownConstraint = findConstraint(mandate, "custodia.max_drawdown_pct.1");
  if (drawdownConstraint !== undefined) {
    if (drawdownConstraint.value < POLICY_MAX_DRAWDOWN_FLOOR_PCT) {
      return deny(
        `max_drawdown_pct of ${drawdownConstraint.value}% is below the absolute policy floor ` +
          `of ${POLICY_MAX_DRAWDOWN_FLOOR_PCT}%. This mandate would authorise catastrophic loss.`,
        drawdownConstraint.type,
      );
    }
  }

  // ── 3. Trade size ceiling (absolute policy bound) ────────────────────────
  const tradeConstraint = findConstraint(mandate, "custodia.max_trade_usd.1");
  if (tradeConstraint !== undefined) {
    if (tradeConstraint.value > POLICY_MAX_TRADE_USD_CEILING) {
      return deny(
        `max_trade_usd of $${tradeConstraint.value.toLocaleString("en-US")} exceeds the ` +
          `absolute policy ceiling of $${POLICY_MAX_TRADE_USD_CEILING.toLocaleString("en-US")}.`,
        tradeConstraint.type,
      );
    }
  }

  // ── 4. Volatility coherence ───────────────────────────────────────────────
  // The 24-h realized volatility from The Graph tells us how much the asset
  // has already moved in pct terms. A drawdown limit tighter than that would
  // trigger immediately — almost certainly a misconfiguration or a malicious
  // proposal from a rogue LLM response.
  if (drawdownConstraint !== undefined) {
    // realizedVol24hPct is expressed as a positive percentage (e.g. 4.2 = 4.2%).
    // We compare it to the absolute value of the drawdown limit.
    const drawdownAbs = Math.abs(drawdownConstraint.value);
    if (drawdownAbs < market.realizedVol24hPct) {
      return deny(
        `max_drawdown_pct of ${drawdownConstraint.value}% (abs ${drawdownAbs}%) is tighter than ` +
          `the 24-h realized volatility of ${market.realizedVol24hPct.toFixed(2)}% observed on-chain. ` +
          "This guard would trigger immediately. Widen the drawdown limit or wait for calmer market conditions.",
        drawdownConstraint.type,
      );
    }
  }

  // Compute 24-h high-low drawdown from the OHLCV data for the audit log.
  const closes = market.hourly.map((h) => h.close);
  const high24h = Math.max(...closes);
  const low24h = Math.min(...closes);
  const observedDrawdownPct =
    high24h > 0 ? (((low24h - high24h) / high24h) * 100).toFixed(2) : "n/a";

  return allow(
    `Risk limits pass. Market: ETH $${market.priceUsd.toFixed(2)}, ` +
      `24h vol ${market.realizedVol24hPct.toFixed(2)}%, ` +
      `24h drawdown ${observedDrawdownPct}%, ` +
      `TVL $${(market.tvlUsd / 1_000_000).toFixed(1)}M. ` +
      `Mandate drawdown limit: ${drawdownConstraint?.value ?? "unconstrained"}%, ` +
      `trade limit: $${tradeConstraint?.value?.toLocaleString("en-US") ?? "unconstrained"}.`,
  );
}

export {
  PAPER_DEFAULTS,
  type PaperObservation,
  type PaperSettings,
  type PaperState,
  paperEquity,
  paperFill,
  replayPaper,
  seedPaper,
} from "./paper.js";
