import { expect, it } from "vitest";
import {
  COMPACT_WIDTH,
  isCompact,
  layoutForWidth,
  nearestIndex,
  tooltipSide,
} from "./chart-geometry.js";
import { chartScale } from "./chart-overlays.js";

it("lays out in CSS pixels for the measured width and goes compact on phones", () => {
  expect(layoutForWidth(null).width).toBe(720);
  const phone = layoutForWidth(340);
  expect(phone.width).toBe(340);
  expect(isCompact(phone)).toBe(true);
  expect(phone.padding.left).toBeLessThan(layoutForWidth(900).padding.left);
  expect(isCompact(layoutForWidth(COMPACT_WIDTH))).toBe(false);
});

it("snaps a pointer x to the nearest point and clamps at the edges", () => {
  const layout = layoutForWidth(340);
  const scale = chartScale(
    Array.from({ length: 24 }, (_, i) => ({ ts: i * 3600, close: 100 + i })),
    "24h",
    [],
    layout,
  );
  expect(nearestIndex(24, scale.x(0), layout)).toBe(0);
  expect(nearestIndex(24, scale.x(23), layout)).toBe(23);
  expect(nearestIndex(24, scale.x(11) + 1, layout)).toBe(11);
  expect(nearestIndex(24, -50, layout)).toBe(0);
  expect(nearestIndex(24, 5000, layout)).toBe(23);
  expect(nearestIndex(1, 20, layout)).toBe(0);
});

it("flips the tooltip to the left near the right edge", () => {
  const layout = layoutForWidth(500);
  expect(tooltipSide(100, layout)).toBe("right");
  expect(tooltipSide(400, layout)).toBe("left");
});
