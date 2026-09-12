import { CHART_LAYOUT, type ChartLayout } from "./chart-overlays";

/** Below this container width the chart drops inline overlay labels (they go to the key). */
export const COMPACT_WIDTH = 480;

/**
 * Lay the chart out in CSS pixels for the measured container width, so text
 * stays legible on a phone instead of being a 720-unit viewBox scaled to 340px.
 * A null width (server render, first paint) keeps the default layout.
 */
export const layoutForWidth = (widthPx: number | null): ChartLayout => {
  if (!widthPx || widthPx <= 0) return CHART_LAYOUT;
  const compact = widthPx < COMPACT_WIDTH;
  return {
    width: Math.round(widthPx),
    height: compact ? 200 : 250,
    padding: compact
      ? { top: 16, right: 10, bottom: 24, left: 10 }
      : { top: 20, right: 18, bottom: 28, left: 18 },
  };
};

export const isCompact = (layout: ChartLayout): boolean => layout.width < COMPACT_WIDTH;

/** Index of the data point whose x is nearest to `xPx` (chart-space pixels). Clamped. */
export const nearestIndex = (count: number, xPx: number, layout: ChartLayout): number => {
  if (count <= 1) return 0;
  const inner = layout.width - layout.padding.left - layout.padding.right;
  if (inner <= 0) return 0;
  const ratio = (xPx - layout.padding.left) / inner;
  return Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))));
};

/** Where a tooltip should sit so it never runs off the plot: flip to the left past 60 % width. */
export const tooltipSide = (xPx: number, layout: ChartLayout): "left" | "right" =>
  xPx > layout.width * 0.6 ? "left" : "right";
