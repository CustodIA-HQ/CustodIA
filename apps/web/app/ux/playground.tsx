"use client";

import {
  MARKET_ASSETS,
  type MarketAsset,
  type MarketContext,
  type MarketPair,
} from "@custodia/schema";
import { useEffect, useMemo, useState } from "react";
import { PRODUCT_CASES } from "../cases";
import { GeneratedUx } from "../components/generated-ux";
import GuardChart from "../guard/guard-chart";
import { buildChartOverlays, type ChartRange } from "./chart-overlays";
import { demoSpec, type LabCase, labMarket } from "./samples";

const LAB_CASES: Array<{ id: LabCase; title: string; prompt: string }> = [
  {
    id: "research",
    title: "Research (no ENS)",
    prompt: "What is ETH doing today?",
  },
  ...PRODUCT_CASES.map((item) => ({
    id: item.template,
    title: item.title,
    prompt: item.prompt,
  })),
];

export function UxPlayground({ initial = "position_protection" }: { initial?: LabCase }) {
  const [current, setCurrent] = useState<LabCase>(initial);
  const [volPct, setVolPct] = useState(6);
  const [envelopeUsd, setEnvelopeUsd] = useState(2500);
  const [notionalUsd, setNotionalUsd] = useState(500);
  const [deductiblePct, setDeductiblePct] = useState(15);
  const [mix, setMix] = useState<"eth" | "balanced" | "usdc">("balanced");
  const [range, setRange] = useState<ChartRange>("24h");
  const [pair, setPair] = useState<MarketPair>("ETH/USDC");
  const [liveMarkets, setLiveMarkets] = useState<MarketContext[]>([]);
  const [live, setLive] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const portfolio =
    mix === "eth"
      ? { eth: "4", usdc: "200" }
      : mix === "usdc"
        ? { eth: "0.4", usdc: "4000" }
        : { eth: "2.4", usdc: "1800" };

  useEffect(() => {
    let stop = false;
    void (async () => {
      try {
        const response = await fetch("/api/market");
        const body = (await response.json()) as {
          live?: boolean;
          market?: MarketContext;
          markets?: MarketContext[];
          error?: string;
        };
        if (stop) return;
        const series = (
          body.markets?.length ? body.markets : body.market ? [body.market] : []
        ).filter((row) => row.hourly && row.hourly.length >= 24);
        if (response.ok && body.live && series.length > 0) {
          setLiveMarkets(series);
          setLive(true);
          setLiveError(null);
          const eth = series.find((row) => row.pair === "ETH/USDC") ?? series[0];
          if (eth) setVolPct(Math.max(1, Math.round(eth.realizedVol24hPct)));
        } else {
          setLive(false);
          setLiveError(body.error ?? "Graph market context unavailable.");
        }
      } catch (error) {
        if (stop) return;
        setLive(false);
        setLiveError(error instanceof Error ? error.message : "Graph market context unavailable.");
      }
    })();
    return () => {
      stop = true;
    };
  }, []);

  const liveMarket = liveMarkets.find((row) => row.pair === pair);
  const market = live && liveMarket ? liveMarket : labMarket(volPct, pair);
  const pairSpot = market.hourly.at(-1)?.close ?? market.priceUsd;
  const [baseAsset, quoteAsset] = pair.split("/") as [MarketAsset, MarketAsset];
  const setPairParts = (base: MarketAsset, quote: MarketAsset) => {
    if (base === quote) {
      const fallback = MARKET_ASSETS.find((asset) => asset !== base) ?? "USDC";
      setPair(`${base}/${fallback}` as MarketPair);
      return;
    }
    setPair(`${base}/${quote}` as MarketPair);
  };
  const active: LabCase =
    current === "spot_execution" || current === "needs_human"
      ? notionalUsd > envelopeUsd
        ? "needs_human"
        : "spot_execution"
      : current;

  const spec = useMemo(() => {
    if (active === "research") return null;
    return demoSpec(active, {
      case: active,
      volPct: live ? market.realizedVol24hPct : volPct,
      envelopeUsd,
      notionalUsd,
      deductiblePct,
      eth: portfolio.eth,
      usdc: portfolio.usdc,
      market,
    });
  }, [
    active,
    volPct,
    envelopeUsd,
    notionalUsd,
    deductiblePct,
    portfolio.eth,
    portfolio.usdc,
    market,
    live,
  ]);

  const { overlays } = useMemo(
    () =>
      buildChartOverlays({
        hourly: market.hourly,
        range,
        spotUsd: pairSpot,
        priceUsd: market.priceUsd,
        deductiblePct,
        envelopeUsd,
        notionalUsd,
        base: market.base,
      }),
    [
      market.hourly,
      range,
      pairSpot,
      market.priceUsd,
      deductiblePct,
      envelopeUsd,
      notionalUsd,
      market.base,
    ],
  );

  return (
    <div className="ux-lab">
      <aside className="ux-lab__rail">
        <p className="home-hero__note">
          {live ? `Live Graph · ${liveMarkets.length} pairs` : "Sample · Graph unavailable"}
        </p>
        <h1>Generated UX</h1>
        <p>
          Pick a case, then slide the chart and fire operation triggers. Overlays use the same
          numbers as the generated spec.
        </p>
        {!live && liveError && <p className="guard-page__muted">{liveError}</p>}

        <fieldset className="ux-lab__group">
          <legend>Case</legend>
          {LAB_CASES.map((item) => (
            <button
              key={item.id}
              className={active === item.id ? "ux-lab__chip ux-lab__chip--on" : "ux-lab__chip"}
              type="button"
              title={item.prompt}
              onClick={() => setCurrent(item.id)}
            >
              {item.title}
            </button>
          ))}
        </fieldset>

        <fieldset className="ux-lab__group">
          <legend>Base</legend>
          {MARKET_ASSETS.map((value) => (
            <button
              key={value}
              className={baseAsset === value ? "ux-lab__chip ux-lab__chip--on" : "ux-lab__chip"}
              type="button"
              onClick={() => setPairParts(value, quoteAsset)}
            >
              {value}
            </button>
          ))}
        </fieldset>

        <fieldset className="ux-lab__group">
          <legend>Quote</legend>
          {MARKET_ASSETS.map((value) => {
            const next = `${baseAsset}/${value}` as MarketPair;
            const available =
              value !== baseAsset && (!live || liveMarkets.some((row) => row.pair === next));
            return (
              <button
                key={value}
                className={quoteAsset === value ? "ux-lab__chip ux-lab__chip--on" : "ux-lab__chip"}
                type="button"
                disabled={!available}
                onClick={() => setPairParts(baseAsset, value)}
              >
                {value}
              </button>
            );
          })}
        </fieldset>

        <fieldset className="ux-lab__group">
          <legend>Chart range</legend>
          {(
            [
              ["24h", "24 hours"],
              ["7d", "7 days"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={range === value ? "ux-lab__chip ux-lab__chip--on" : "ux-lab__chip"}
              type="button"
              onClick={() => setRange(value)}
            >
              {label}
            </button>
          ))}
        </fieldset>

        {!live && (
          <fieldset className="ux-lab__group">
            <legend>Volatility</legend>
            {(
              [
                [3, "Quiet"],
                [6, "Base"],
                [14, "Shock"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                className={volPct === value ? "ux-lab__chip ux-lab__chip--on" : "ux-lab__chip"}
                type="button"
                onClick={() => setVolPct(value)}
              >
                {label} {value}%
              </button>
            ))}
          </fieldset>
        )}

        <fieldset className="ux-lab__group">
          <legend>Max trade / envelope</legend>
          {(
            [
              [400, "Tight $400"],
              [2500, "Base $2.5k"],
              [20_000, "Wide $20k"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={envelopeUsd === value ? "ux-lab__chip ux-lab__chip--on" : "ux-lab__chip"}
              type="button"
              onClick={() => setEnvelopeUsd(value)}
            >
              {label}
            </button>
          ))}
        </fieldset>

        <fieldset className="ux-lab__group">
          <legend>Spot size</legend>
          {([200, 500, 50_000] as const).map((value) => (
            <button
              key={value}
              className={notionalUsd === value ? "ux-lab__chip ux-lab__chip--on" : "ux-lab__chip"}
              type="button"
              onClick={() => {
                setNotionalUsd(value);
                setCurrent(value > envelopeUsd ? "needs_human" : "spot_execution");
              }}
            >
              ${value.toLocaleString("en-US")}
            </button>
          ))}
        </fieldset>

        <fieldset className="ux-lab__group">
          <legend>Deductible / floor</legend>
          {([5, 15, 25] as const).map((value) => (
            <button
              key={value}
              className={deductiblePct === value ? "ux-lab__chip ux-lab__chip--on" : "ux-lab__chip"}
              type="button"
              onClick={() => {
                setDeductiblePct(value);
                setCurrent("position_protection");
              }}
            >
              {value}%
            </button>
          ))}
        </fieldset>

        <fieldset className="ux-lab__group">
          <legend>Holdings mix</legend>
          {(
            [
              ["eth", "ETH-heavy"],
              ["balanced", "Balanced"],
              ["usdc", "USDC-heavy"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              className={mix === value ? "ux-lab__chip ux-lab__chip--on" : "ux-lab__chip"}
              type="button"
              onClick={() => setMix(value)}
            >
              {label}
            </button>
          ))}
        </fieldset>
      </aside>

      <section className="ux-lab__stage" aria-live="polite">
        <p className="home-hero__note">
          alice.custodia.eth/demo/{active.replaceAll("_", "-")}
          {active === "research" ? " · ephemeral" : ""}
          {live ? " · live Graph" : " · sample"}
        </p>
        <GuardChart
          market={market}
          range={range}
          overlays={overlays}
          source={live && liveMarket ? "live" : "sample"}
        />
        {active === "research" || !spec ? (
          <>
            <h2>Research</h2>
            <p>No mandate and no ENS record. The chart above is the research surface.</p>
          </>
        ) : (
          <GeneratedUx spec={spec} market={market} hideChart />
        )}
      </section>
    </div>
  );
}
