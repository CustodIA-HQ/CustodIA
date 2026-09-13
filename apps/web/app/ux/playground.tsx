"use client";

import {
  MARKET_ASSETS,
  type MarketAsset,
  type MarketContext,
  type MarketPair,
} from "@custodia/schema";
import { useEffect, useMemo, useState } from "react";
import { PRODUCT_CASES } from "../cases";
import { CasesLabInteractionProvider, CasesLabNav } from "../components/cases-lab-interaction";
import { DashboardChartCard } from "../components/dashboard-chart-card";
import { GeneratedUx } from "../components/generated-ux";
import { SidebarCategory } from "../components/sidebar-category";
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
  const [panelOpen, setPanelOpen] = useState(false);
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

  const caseTitle = LAB_CASES.find((item) => item.id === active)?.title ?? active;
  const rangeLabel = range === "24h" ? "24 hours" : "7 days";
  const volLabel = volPct === 3 ? "Quiet 3%" : volPct === 14 ? "Shock 14%" : `Base ${volPct}%`;
  const envelopeLabel =
    envelopeUsd === 400 ? "Tight $400" : envelopeUsd === 20_000 ? "Wide $20k" : "Base $2.5k";
  const mixLabel = mix === "eth" ? "ETH-heavy" : mix === "usdc" ? "USDC-heavy" : "Balanced";

  return (
    <CasesLabInteractionProvider>
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

          <CasesLabNav>
            <SidebarCategory legend="Case" value={caseTitle}>
              {LAB_CASES.map((item) => (
                <button
                  key={item.id}
                  className={
                    active === item.id ? "ux-cat__option ux-cat__option--on" : "ux-cat__option"
                  }
                  type="button"
                  title={item.prompt}
                  onClick={() => setCurrent(item.id)}
                >
                  {item.title}
                </button>
              ))}
            </SidebarCategory>

            <SidebarCategory legend="Base" value={baseAsset}>
              {MARKET_ASSETS.map((value) => (
                <button
                  key={value}
                  className={
                    baseAsset === value ? "ux-cat__option ux-cat__option--on" : "ux-cat__option"
                  }
                  type="button"
                  onClick={() => setPairParts(value, quoteAsset)}
                >
                  {value}
                </button>
              ))}
            </SidebarCategory>

            <SidebarCategory legend="Quote" value={quoteAsset}>
              {MARKET_ASSETS.map((value) => {
                const next = `${baseAsset}/${value}` as MarketPair;
                const available =
                  value !== baseAsset && (!live || liveMarkets.some((row) => row.pair === next));
                return (
                  <button
                    key={value}
                    className={
                      quoteAsset === value ? "ux-cat__option ux-cat__option--on" : "ux-cat__option"
                    }
                    type="button"
                    disabled={!available}
                    onClick={() => setPairParts(baseAsset, value)}
                  >
                    {value}
                  </button>
                );
              })}
            </SidebarCategory>

            <SidebarCategory legend="Chart range" value={rangeLabel}>
              {(
                [
                  ["24h", "24 hours"],
                  ["7d", "7 days"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={
                    range === value ? "ux-cat__option ux-cat__option--on" : "ux-cat__option"
                  }
                  type="button"
                  onClick={() => setRange(value)}
                >
                  {label}
                </button>
              ))}
            </SidebarCategory>

            {!live && (
              <SidebarCategory legend="Volatility" value={volLabel}>
                {(
                  [
                    [3, "Quiet"],
                    [6, "Base"],
                    [14, "Shock"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    className={
                      volPct === value ? "ux-cat__option ux-cat__option--on" : "ux-cat__option"
                    }
                    type="button"
                    onClick={() => setVolPct(value)}
                  >
                    {label} {value}%
                  </button>
                ))}
              </SidebarCategory>
            )}

            <SidebarCategory legend="Max trade / envelope" value={envelopeLabel}>
              {(
                [
                  [400, "Tight $400"],
                  [2500, "Base $2.5k"],
                  [20_000, "Wide $20k"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={
                    envelopeUsd === value ? "ux-cat__option ux-cat__option--on" : "ux-cat__option"
                  }
                  type="button"
                  onClick={() => setEnvelopeUsd(value)}
                >
                  {label}
                </button>
              ))}
            </SidebarCategory>

            <SidebarCategory legend="Spot size" value={`$${notionalUsd.toLocaleString("en-US")}`}>
              {([200, 500, 50_000] as const).map((value) => (
                <button
                  key={value}
                  className={
                    notionalUsd === value ? "ux-cat__option ux-cat__option--on" : "ux-cat__option"
                  }
                  type="button"
                  onClick={() => {
                    setNotionalUsd(value);
                    setCurrent(value > envelopeUsd ? "needs_human" : "spot_execution");
                  }}
                >
                  ${value.toLocaleString("en-US")}
                </button>
              ))}
            </SidebarCategory>

            <SidebarCategory legend="Deductible / floor" value={`${deductiblePct}%`}>
              {([5, 15, 25] as const).map((value) => (
                <button
                  key={value}
                  className={
                    deductiblePct === value ? "ux-cat__option ux-cat__option--on" : "ux-cat__option"
                  }
                  type="button"
                  onClick={() => {
                    setDeductiblePct(value);
                    setCurrent("position_protection");
                  }}
                >
                  {value}%
                </button>
              ))}
            </SidebarCategory>

            <SidebarCategory legend="Holdings mix" value={mixLabel}>
              {(
                [
                  ["eth", "ETH-heavy"],
                  ["balanced", "Balanced"],
                  ["usdc", "USDC-heavy"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  className={mix === value ? "ux-cat__option ux-cat__option--on" : "ux-cat__option"}
                  type="button"
                  onClick={() => setMix(value)}
                >
                  {label}
                </button>
              ))}
            </SidebarCategory>
          </CasesLabNav>
        </aside>

        <section className="ux-lab__stage" aria-live="polite">
          <p className="home-hero__note">
            alice.custodia.eth/demo/{active.replaceAll("_", "-")}
            {active === "research" ? " · ephemeral" : ""}
            {live ? " · live Graph" : " · sample"}
          </p>
          <div className="ux-lab__dash">
            <DashboardChartCard>
              <GuardChart
                market={market}
                range={range}
                overlays={overlays}
                source={live && liveMarket ? "live" : "sample"}
              />
            </DashboardChartCard>
            {active === "research" || !spec ? (
              <div className="ux-lab__research">
                <h2>Research</h2>
                <p>No mandate and no ENS record. The chart above is the research surface.</p>
              </div>
            ) : (
              <GeneratedUx spec={spec} market={market} hideChart dashboard />
            )}
          </div>
        </section>
      </div>
    </CasesLabInteractionProvider>
  );
}
