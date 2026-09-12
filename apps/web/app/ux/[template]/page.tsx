import type { TaskTemplate } from "@custodia/schema";
import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "../../components/site-header";
import { UxPlayground } from "../playground";

const TEMPLATES: Record<string, TaskTemplate> = {
  "portfolio-guard": "portfolio_guard",
  "position-protection": "position_protection",
  "collateral-guard": "collateral_guard",
  "spot-execution": "spot_execution",
  "futures-execution": "futures_execution",
  "strategy-compare": "strategy_compare",
  "needs-human": "needs_human",
};

export default async function UxCasePage({ params }: { params: Promise<{ template: string }> }) {
  const { template: raw } = await params;
  const template = TEMPLATES[raw];
  if (!template) notFound();

  return (
    <main className="product-page product-page--lab" id="main">
      <SiteHeader active="cases" />
      <UxPlayground initial={template} />
      <SiteFooter />
    </main>
  );
}
