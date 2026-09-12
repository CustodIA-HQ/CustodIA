export type ChartLayout = {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
};

/** Server-render default; the client re-lays out in CSS pixels (see chart-geometry.ts). */
export const CHART_LAYOUT: ChartLayout = {
  width: 720,
  height: 250,
  padding: { top: 20, right: 18, bottom: 28, left: 18 },
};

export type ChartRange = "24h" | "7d";

export type HourlyPoint = { ts: number; close: number };

export type OverlayKind = "floor" | "spot" | "envelope" | "notional";

export type ChartOverlay = {
  id: OverlayKind;
  priceUsd: number;
  y: number;
  x: number;
  label: string;
  outside: boolean;
};

export type ChartOverlayInput = {
  hourly: HourlyPoint[];
  range: ChartRange;
  spotUsd: number;
  deductiblePct: number;
  envelopeUsd: number;
  notionalUsd: number;
  base?: string;
  /** USD of the base asset; used to convert envelope/notional into units. */
  priceUsd?: number;
};

export const hoursForRange = (range: ChartRange): number => (range === "7d" ? 7 * 24 : 24);

export const sliceHourly = (hourly: HourlyPoint[], range: ChartRange): HourlyPoint[] =>
  hourly.slice(-hoursForRange(range));

export const protectionFloorUsd = (spotUsd: number, deductiblePct: number): number =>
  spotUsd * (1 - deductiblePct / 100);

export const ethAtSpot = (usd: number, spotUsd: number): number =>
  spotUsd > 0 ? usd / spotUsd : 0;

type Scale = {
  points: HourlyPoint[];
  low: number;
  high: number;
  spread: number;
  innerWidth: number;
  innerHeight: number;
  x: (index: number) => number;
  y: (value: number) => number;
};

export const chartScale = (
  hourly: HourlyPoint[],
  range: ChartRange,
  extra: number[] = [],
  layout: ChartLayout = CHART_LAYOUT,
): Scale => {
  const points = sliceHourly(hourly, range);
  const values = [
    ...points.map((point) => point.close),
    ...extra.filter((value) => Number.isFinite(value)),
  ];
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 1;
  const spread = Math.max(high - low, high * 0.001, 0.01);
  const innerWidth = layout.width - layout.padding.left - layout.padding.right;
  const innerHeight = layout.height - layout.padding.top - layout.padding.bottom;
  const x = (index: number) =>
    layout.padding.left +
    (points.length <= 1 ? innerWidth / 2 : (index / (points.length - 1)) * innerWidth);
  const y = (value: number) => layout.padding.top + ((high - value) / spread) * innerHeight;
  return { points, low, high, spread, innerWidth, innerHeight, x, y };
};

const usd = (value: number): string => `$${Math.round(value).toLocaleString("en-US")}`;

export const buildChartOverlays = (
  input: ChartOverlayInput,
): {
  points: HourlyPoint[];
  overlays: ChartOverlay[];
} => {
  const floorUsd = protectionFloorUsd(input.spotUsd, input.deductiblePct);
  const scale = chartScale(input.hourly, input.range, [input.spotUsd, floorUsd]);
  const lastIndex = Math.max(scale.points.length - 1, 0);
  const lastX = scale.x(lastIndex);
  const outside = input.notionalUsd > input.envelopeUsd;
  const unit = input.base ?? "ETH";
  const unitPrice = input.priceUsd && input.priceUsd > 0 ? input.priceUsd : input.spotUsd;
  const overlays: ChartOverlay[] = [
    {
      id: "spot",
      priceUsd: input.spotUsd,
      y: scale.y(input.spotUsd),
      x: lastX,
      label: `Spot ${usd(input.spotUsd)}`,
      outside: false,
    },
    {
      id: "floor",
      priceUsd: floorUsd,
      y: scale.y(floorUsd),
      x: lastX,
      label: `Floor ${usd(floorUsd)} · ${input.deductiblePct}% deductible`,
      outside: false,
    },
    {
      id: "envelope",
      priceUsd: input.spotUsd,
      y: scale.y(input.spotUsd),
      x: lastX,
      label: `Max trade ${usd(input.envelopeUsd)} · ${ethAtSpot(input.envelopeUsd, unitPrice).toFixed(2)} ${unit}`,
      outside: false,
    },
    {
      id: "notional",
      priceUsd: input.spotUsd,
      y: scale.y(input.spotUsd),
      x: lastX,
      label: outside
        ? `Trade ${usd(input.notionalUsd)} outside envelope`
        : `Trade ${usd(input.notionalUsd)} · ${ethAtSpot(input.notionalUsd, unitPrice).toFixed(2)} ${unit}`,
      outside,
    },
  ];
  return { points: scale.points, overlays };
};
