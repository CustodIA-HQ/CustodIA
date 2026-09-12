import { expect, it } from "vitest";
import {
  buildChartOverlays,
  CHART_LAYOUT,
  chartScale,
  ethAtSpot,
  hoursForRange,
  protectionFloorUsd,
  sliceHourly,
} from "./chart-overlays.js";

const series = (count: number, base = 2500): Array<{ ts: number; close: number }> =>
  Array.from({ length: count }, (_, index) => ({
    ts: 1_700_000_000 + index * 3600,
    close: base + index,
  }));

it("slices 24h vs 7d from the same hourly series", () => {
  const hourly = series(200, 2400);
  expect(hoursForRange("24h")).toBe(24);
  expect(hoursForRange("7d")).toBe(168);
  expect(sliceHourly(hourly, "24h")).toHaveLength(24);
  expect(sliceHourly(hourly, "7d")).toHaveLength(168);
  expect(sliceHourly(hourly, "24h").at(-1)?.close).toBe(hourly.at(-1)?.close);
  expect(sliceHourly(hourly, "24h")[0]?.close).not.toBe(sliceHourly(hourly, "7d")[0]?.close);
});

it("maps deductible to a floor price and a distinct SVG y from spot", () => {
  const hourly = series(48, 2500);
  const spotUsd = 2500;
  const deductiblePct = 15;
  const floorUsd = protectionFloorUsd(spotUsd, deductiblePct);
  expect(floorUsd).toBe(2125);
  const mapped = buildChartOverlays({
    hourly,
    range: "24h",
    spotUsd,
    deductiblePct,
    envelopeUsd: 2500,
    notionalUsd: 500,
  });
  const floor = mapped.overlays.find((row) => row.id === "floor");
  const spot = mapped.overlays.find((row) => row.id === "spot");
  expect(floor?.priceUsd).toBe(2125);
  expect(floor?.label).toMatch(/15%/);
  expect(spot?.priceUsd).toBe(2500);
  expect(floor?.y).not.toBe(spot?.y);
  const scale = chartScale(hourly, "24h", [spotUsd, floorUsd]);
  expect(floor?.y).toBeCloseTo(scale.y(2125), 5);
});

it("keeps a floor below the visible series inside the chart box", () => {
  const hourly = series(24, 2500);
  const mapped = buildChartOverlays({
    hourly,
    range: "24h",
    spotUsd: 2523,
    deductiblePct: 15,
    envelopeUsd: 2500,
    notionalUsd: 500,
  });
  const floor = mapped.overlays.find((row) => row.id === "floor");
  const top = CHART_LAYOUT.padding.top;
  const bottom = CHART_LAYOUT.height - CHART_LAYOUT.padding.bottom;
  expect(floor?.priceUsd).toBeCloseTo(2523 * 0.85);
  expect(floor?.y).toBeGreaterThanOrEqual(top);
  expect(floor?.y).toBeLessThanOrEqual(bottom);
});

it("marks envelope vs notional as distinct overlays and flags an outside trade", () => {
  const hourly = series(30, 2000);
  const inside = buildChartOverlays({
    hourly,
    range: "24h",
    spotUsd: 2000,
    deductiblePct: 10,
    envelopeUsd: 2500,
    notionalUsd: 500,
  });
  const outside = buildChartOverlays({
    hourly,
    range: "24h",
    spotUsd: 2000,
    deductiblePct: 10,
    envelopeUsd: 400,
    notionalUsd: 50_000,
  });
  const env = inside.overlays.find((row) => row.id === "envelope");
  const trade = inside.overlays.find((row) => row.id === "notional");
  expect(env?.outside).toBe(false);
  expect(trade?.outside).toBe(false);
  expect(env?.label).toContain("2,500");
  expect(trade?.label).toContain("500");
  expect(env?.label).not.toBe(trade?.label);
  expect(ethAtSpot(2500, 2000)).toBeCloseTo(1.25);
  const blocked = outside.overlays.find((row) => row.id === "notional");
  expect(blocked?.outside).toBe(true);
  expect(blocked?.label).toMatch(/outside envelope/i);
  expect(blocked?.label).not.toBe(trade?.label);
});
