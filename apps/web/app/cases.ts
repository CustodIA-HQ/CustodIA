import type { TaskTemplate } from "@custodia/schema";

export const PRODUCT_CASES: Array<{
  template: TaskTemplate;
  href: string;
  title: string;
  prompt: string;
}> = [
  {
    template: "position_protection",
    href: "/ux/position-protection",
    title: "Position protection",
    prompt: "Protect me if ETH drops more than 15%",
  },
  {
    template: "portfolio_guard",
    href: "/ux/portfolio-guard",
    title: "Portfolio guard",
    prompt: "Keep ETH/USDC inside a 5% drawdown",
  },
  {
    template: "collateral_guard",
    href: "/ux/collateral-guard",
    title: "Collateral health",
    prompt: "Protect my collateral if health factor approaches 1.35",
  },
  {
    template: "spot_execution",
    href: "/ux/spot-execution",
    title: "Spot confirmation",
    prompt: "Buy 500 USDC of ETH",
  },
  {
    template: "futures_execution",
    href: "/ux/futures-execution",
    title: "Futures envelope",
    prompt: "Open a small ETH future",
  },
  {
    template: "strategy_compare",
    href: "/ux/strategy-compare",
    title: "Strategy comparison",
    prompt: "Compare ETH and USDC allocations",
  },
  {
    template: "needs_human",
    href: "/ux/needs-human",
    title: "Needs a new signature",
    prompt: "Buy 50000 USDC of ETH",
  },
];
