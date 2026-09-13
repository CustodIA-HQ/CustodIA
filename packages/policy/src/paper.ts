import type { Mandate, PolicyDecision, ProposedAction } from "@custodia/schema";
import { evaluate } from "./index.js";

export type PaperSettings = { feeBps: number; slippageBps: number };
export const PAPER_DEFAULTS: PaperSettings = { feeBps: 5, slippageBps: 10 };
export type PaperState = {
  eth: number;
  usdc: number;
  initialEquityUsd: number;
  highWaterUsd: number;
  spentUsd: number;
  feesUsd: number;
  lastTs: number;
};
export type PaperObservation = { ts: number; priceUsd: number };
export const paperEquity = (state: PaperState, price: number) => state.eth * price + state.usdc;
const valid = (n: number) => Number.isFinite(n) && n >= 0;
export function seedPaper(eth: number, usdc: number, observation: PaperObservation): PaperState {
  if (
    ![eth, usdc, observation.ts].every(valid) ||
    !Number.isFinite(observation.priceUsd) ||
    observation.priceUsd <= 0
  )
    throw new Error("Invalid paper portfolio or observation");
  const equity = eth * observation.priceUsd + usdc;
  if (equity <= 0) throw new Error("No supported wallet holdings to seed paper trading");
  return {
    eth,
    usdc,
    initialEquityUsd: equity,
    highWaterUsd: equity,
    spentUsd: 0,
    feesUsd: 0,
    lastTs: observation.ts,
  };
}
export function paperFill(
  state: PaperState,
  observation: PaperObservation,
  action: Extract<ProposedAction, { kind: "rebalance" }>,
  mandate: Mandate,
  settings = PAPER_DEFAULTS,
) {
  if (
    !Object.values(state).every(valid) ||
    ![settings.feeBps, settings.slippageBps, observation.ts, action.notionalUsd].every(valid) ||
    settings.feeBps > 1000 ||
    settings.slippageBps > 1000 ||
    observation.priceUsd <= 0 ||
    !Number.isFinite(observation.priceUsd) ||
    observation.ts < state.lastTs
  )
    throw new Error("Invalid or out-of-order paper-trading input");
  const beforeUsd = paperEquity(state, observation.priceUsd);
  const highWaterUsd = Math.max(state.highWaterUsd, beforeUsd);
  let decision: PolicyDecision = evaluate(mandate, action, {
    spentUsd: state.spentUsd,
    now: observation.ts,
  });
  const deny = (reason: string) => {
    decision = { allowed: false, reason };
  };
  const permission = mandate.constraints.find((c) => c.type === "custodia.allow_rebalance.1");
  const allowed = mandate.constraints.find((c) => c.type === "custodia.allowed_assets.1");
  if (!permission?.value || !allowed?.assets.includes("ETH") || !allowed.assets.includes("USDC"))
    deny("Paper trading requires explicit ETH/USDC rebalance permission");
  const buying = action.fromAsset === "USDC" && action.toAsset === "ETH";
  const selling = action.fromAsset === "ETH" && action.toAsset === "USDC";
  if ((!buying && !selling) || action.notionalUsd <= 0)
    deny("Only positive ETH/USDC paper trades are supported");
  const drawdown = mandate.constraints.find((c) => c.type === "custodia.max_drawdown_pct.1");
  if (
    drawdown &&
    highWaterUsd > 0 &&
    ((highWaterUsd - beforeUsd) / highWaterUsd) * 100 > drawdown.value
  )
    deny("Paper portfolio drawdown exceeds the signed limit");
  const fillPriceUsd =
    observation.priceUsd * (1 + ((buying ? 1 : -1) * settings.slippageBps) / 10000);
  const feeUsd = (action.notionalUsd * settings.feeBps) / 10000;
  const quantityEth = buying
    ? action.notionalUsd / fillPriceUsd
    : action.notionalUsd / observation.priceUsd;
  if (buying && state.usdc < action.notionalUsd + feeUsd)
    deny("Insufficient paper USDC including fees");
  if (selling && state.eth < quantityEth) deny("Insufficient paper ETH");
  const next = { ...state, highWaterUsd, lastTs: observation.ts };
  if (decision.allowed) {
    next.eth += buying ? quantityEth : -quantityEth;
    next.usdc += buying ? -action.notionalUsd - feeUsd : quantityEth * fillPriceUsd - feeUsd;
    next.spentUsd += action.notionalUsd;
    next.feesUsd += feeUsd;
  }
  const equityUsd = paperEquity(next, observation.priceUsd);
  return {
    simulated: true as const,
    label: "Real market data · simulated execution",
    decision,
    action,
    observation,
    settings,
    fill: decision.allowed ? { fillPriceUsd, quantityEth, feeUsd } : null,
    state: next,
    equityUsd,
    pnlUsd: equityUsd - state.initialEquityUsd,
  };
}

/** Target strategy executes at the NEXT observation, never using future data to decide. */
export function replayPaper(
  initial: { eth: number; usdc: number },
  points: PaperObservation[],
  mandate: Mandate,
  targetEthPct: number,
  settings = PAPER_DEFAULTS,
) {
  if (points.length < 2 || !Number.isFinite(targetEthPct) || targetEthPct < 0 || targetEthPct > 100)
    throw new Error("Replay requires two observations and a valid target");
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) throw new Error("Missing history");
  let state = seedPaper(initial.eth, initial.usdc, first);
  const start = { ...state };
  const results: ReturnType<typeof paperFill>[] = [];
  for (let i = 1; i < points.length; i++) {
    const previous = points[i - 1];
    const observation = points[i];
    if (!previous || !observation) throw new Error("Missing observation");
    const equity = paperEquity(state, previous.priceUsd);
    const delta = (equity * targetEthPct) / 100 - state.eth * previous.priceUsd;
    const action = {
      kind: "rebalance" as const,
      fromAsset: delta > 0 ? "USDC" : "ETH",
      toAsset: delta > 0 ? "ETH" : "USDC",
      notionalUsd: Math.abs(delta),
      reason: "Historical paper replay; previous-observation target",
    };
    const result = paperFill(state, observation, action, mandate, settings);
    results.push(result);
    state = result.state;
  }
  return {
    label: "Historical replay · hypothetical strategy, no execution authority",
    settings,
    start,
    state,
    results,
    equityUsd: paperEquity(state, last.priceUsd),
    buyAndHoldUsd: paperEquity(start, last.priceUsd),
  };
}
