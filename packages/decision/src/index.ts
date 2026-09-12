import type { Candidate } from "@custodia/schema";

export interface AllocationInput {
  ethUsd: number;
  usdcUsd: number;
  minTradeUsd?: number;
  allowRebalance?: boolean;
  maxTradeUsd?: number;
}

const totalOf = (input: AllocationInput): number => input.ethUsd + input.usdcUsd;

const currentPct = (input: AllocationInput): { ethPct: number; usdcPct: number } => {
  const total = totalOf(input);
  if (total <= 0) return { ethPct: 0, usdcPct: 0 };
  const ethPct = Math.round((input.ethUsd / total) * 100);
  return { ethPct, usdcPct: 100 - ethPct };
};

/** ETH/USDC targets in 5-point steps, plus the unchanged allocation. */
export const enumerateCandidates = (input: AllocationInput): Candidate[] => {
  const current = currentPct(input);
  const seen = new Set<string>();
  const out: Candidate[] = [];
  const push = (ethPct: number) => {
    const usdcPct = 100 - ethPct;
    const key = `${ethPct}/${usdcPct}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      ethPct,
      usdcPct,
      feasible: true,
      reasons: [],
      distance: Math.abs(ethPct - current.ethPct),
      estTradeUsd: (Math.abs(ethPct - current.ethPct) / 100) * totalOf(input),
    });
  };
  push(current.ethPct);
  for (let ethPct = 0; ethPct <= 100; ethPct += 5) push(ethPct);
  return out;
};

export const filterFeasible = (candidates: Candidate[], input: AllocationInput): Candidate[] => {
  const minTrade = input.minTradeUsd ?? 1;
  const maxTrade = input.maxTradeUsd ?? Number.POSITIVE_INFINITY;
  const total = totalOf(input);
  return candidates.map((candidate) => {
    const reasons: string[] = [];
    if (total <= 0) reasons.push("No supported holdings to rebalance");
    if (input.allowRebalance === false && candidate.distance > 0) {
      reasons.push("Rebalancing is not permitted");
    }
    if (candidate.estTradeUsd > 0 && candidate.estTradeUsd < minTrade) {
      reasons.push(`Trade of $${candidate.estTradeUsd.toFixed(2)} is below the minimum`);
    }
    if (candidate.estTradeUsd > maxTrade) {
      reasons.push(`Trade exceeds max trade of $${maxTrade}`);
    }
    return { ...candidate, feasible: reasons.length === 0, reasons };
  });
};

export const rank = (candidates: Candidate[]): Candidate[] =>
  [...candidates].sort((a, b) => {
    if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.estTradeUsd - b.estTradeUsd;
  });

export const evaluateAllocations = (input: AllocationInput): Candidate[] =>
  rank(filterFeasible(enumerateCandidates(input), input));
