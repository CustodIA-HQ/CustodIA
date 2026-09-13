import { loadEnsConfig, resolveTask } from "@custodia/ens";
import { MarketPairSchema, UISpecSchema } from "@custodia/schema";
import { z } from "zod";
import { GeneratedUx, type UxMarket } from "./generated-ux";

const ChartRecordSchema = z
  .object({
    schema: z.literal("custodia.chart.1"),
    source: z.string(),
    pair: MarketPairSchema,
    range: z.enum(["24h", "7d"]),
    fetchedAt: z.number(),
    points: z.array(z.object({ ts: z.number(), close: z.number() })).min(24),
  })
  .strict();

const parseRecord = (raw: string | null | undefined): unknown => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

export async function GuardUx({
  ensName,
  directoryPath,
}: {
  ensName: string;
  directoryPath?: string;
}) {
  let records: Record<string, string | null> = {};
  try {
    records = await resolveTask(loadEnsConfig(), ensName);
  } catch {
    records = {};
  }
  const chart = ChartRecordSchema.safeParse(parseRecord(records["xyz.custodia.chart"]));
  const ui = records["xyz.custodia.ui"]
    ? UISpecSchema.safeParse(parseRecord(records["xyz.custodia.ui"]))
    : null;
  // The ENS chart record carries closes only — pool, TVL, vol and block are not
  // on-chain, so they are not fabricated here. Price is the last published close.
  const lastClose = chart.success ? chart.data.points.at(-1)?.close : undefined;
  const market: UxMarket | undefined =
    chart.success && lastClose
      ? {
          pair: chart.data.pair,
          base: chart.data.pair.split("/")[0] ?? "ETH",
          quote: chart.data.pair.split("/")[1] ?? "USDC",
          priceUsd: lastClose,
          hourly: chart.data.points,
        }
      : undefined;

  return (
    <>
      <section className="guard-page__hero">
        <p className="guard-card__eyebrow">Generated UX from ENS</p>
        <h1>{directoryPath ?? ensName}</h1>
        <p>
          ENS subdomain <strong>{ensName}</strong>
          {records["xyz.custodia.owner"] ? (
            <>
              {" "}
              · bound to <strong>{records["xyz.custodia.owner"]}</strong>
            </>
          ) : null}
          {records["xyz.custodia.agent"] ? (
            <>
              {" "}
              · agent <strong>{records["xyz.custodia.agent"]}</strong>
            </>
          ) : null}
        </p>
        <span className="guard-page__status">
          Status: {records["xyz.custodia.status"] || "unpublished"}
        </span>
        {records.url && (
          <p className="guard-page__muted">
            ENS <code>url</code> record: <code>{records.url}</code>
          </p>
        )}
      </section>
      {ui?.success ? (
        <GeneratedUx spec={ui.data} market={market} />
      ) : (
        <p className="guard-page__muted">The UI record is not on ENS yet.</p>
      )}
    </>
  );
}
