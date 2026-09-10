import { loadEnsConfig, resolveTask } from "@custodia/ens";
import { UISpecSchema } from "@custodia/schema";
import Link from "next/link";
import { z } from "zod";
import GuardChart from "../guard-chart";

export const dynamic = "force-dynamic";

const ChartRecordSchema = z
  .object({
    schema: z.literal("custodia.chart.1"),
    source: z.string(),
    pair: z.literal("ETH/USDC"),
    range: z.enum(["24h", "7d"]),
    fetchedAt: z.number(),
    points: z.array(z.object({ ts: z.number(), close: z.number() })).min(24),
  })
  .strict();

export default async function GuardPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;

  try {
    const records = await resolveTask(loadEnsConfig(), name);
    const chart = ChartRecordSchema.safeParse(JSON.parse(records["xyz.custodia.chart"] ?? ""));
    if (!chart.success) {
      return <GuardError message="The ENS guard has no valid chart record yet." />;
    }

    const ui = records["xyz.custodia.ui"]
      ? UISpecSchema.safeParse(JSON.parse(records["xyz.custodia.ui"]))
      : null;
    const market = {
      pair: chart.data.pair,
      priceUsd: chart.data.points.at(-1)?.close ?? 0,
      hourly: chart.data.points,
    };
    const riskSummary = ui?.success
      ? ui.data.components.find((component) => component.type === "risk_summary")
      : undefined;
    const allocation = ui?.success
      ? ui.data.components.find((component) => component.type === "allocation_selector")
      : undefined;
    const drawdown = ui?.success
      ? ui.data.components.find((component) => component.type === "range_slider")
      : undefined;
    const tradeSize = ui?.success
      ? ui.data.components.find((component) => component.type === "amount_selector")
      : undefined;
    const rebalance = ui?.success
      ? ui.data.components.find((component) => component.type === "permission_toggle")
      : undefined;

    return (
      <main className="guard-page">
        <div className="guard-page__topbar">
          <Link href="/#chat">← Back to chat</Link>
          <span>ENS guard · Sepolia</span>
        </div>
        <section className="guard-page__hero">
          <p className="guard-card__eyebrow">Resolved from ENS text records</p>
          <h1>{name}</h1>
          <p>
            This guard is bound to <strong>{records["xyz.custodia.owner"]}</strong> and delegates
            status updates to <strong>{records["xyz.custodia.agent"]}</strong>.
          </p>
          <span className="guard-page__status">
            Status: {records["xyz.custodia.status"] || "unknown"}
          </span>
        </section>

        <GuardChart market={market} range={chart.data.range} />

        <section className="guard-page__details" aria-labelledby="guard-details-title">
          <p className="guard-card__eyebrow">Boundaries</p>
          <h2 id="guard-details-title">The signed guard</h2>
          {ui?.success ? (
            <div className="guard-boundaries">
              {allocation?.type === "allocation_selector" && (
                <div className="guard-boundary">
                  <span>Allocation</span>
                  <strong>{allocation.defaultPct.join("% / ")}%</strong>
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
                    ${tradeSize.min.toLocaleString()}–${tradeSize.max.toLocaleString()}
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
          ) : (
            <p className="guard-page__muted">
              The UI record is unavailable, but the chart is verified from ENS.
            </p>
          )}
          {riskSummary?.type === "risk_summary" && (
            <p className="guard-page__muted">{riskSummary.risk.explanation}</p>
          )}
        </section>
      </main>
    );
  } catch (error) {
    return (
      <GuardError
        message={error instanceof Error ? error.message : "The ENS guard could not be resolved."}
      />
    );
  }
}

function GuardError({ message }: { message: string }) {
  return (
    <main className="guard-page guard-page--error">
      <p className="guard-card__eyebrow">ENS guard</p>
      <h1>Unable to resolve this guard</h1>
      <p>{message}</p>
      <Link href="/#chat">Return to chat</Link>
    </main>
  );
}
