"use client";

import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { nearestIndex } from "./chart-geometry";
import type { ChartLayout } from "./chart-overlays";

/** Width of a container element, tracked with ResizeObserver (null until measured). */
export function useContainerWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    setWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}

/**
 * Crosshair scrubbing for an SVG line chart. Drag or tap on touch, hover on
 * mouse, arrow keys on the focused chart. The selected index persists after a
 * touch ends so the reader can lift their finger and still read the value.
 */
export function useChartScrub(count: number, layout: ChartLayout) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [index, setIndex] = useState<number | null>(null);
  const dragging = useRef(false);

  const indexAt = useCallback(
    (clientX: number): number | null => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return null;
      const x = ((clientX - rect.left) / rect.width) * layout.width;
      return nearestIndex(count, x, layout);
    },
    [count, layout],
  );

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    dragging.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setIndex(indexAt(event.clientX));
  };
  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "mouse" || dragging.current) setIndex(indexAt(event.clientX));
  };
  const onPointerUp = () => {
    dragging.current = false;
  };
  const onPointerLeave = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "mouse" && !dragging.current) setIndex(null);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (count === 0) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const step = event.key === "ArrowLeft" ? -1 : 1;
      setIndex((current) => Math.min(count - 1, Math.max(0, (current ?? count - 1) + step)));
    } else if (event.key === "Home") {
      setIndex(0);
    } else if (event.key === "End") {
      setIndex(count - 1);
    } else if (event.key === "Escape") {
      setIndex(null);
    }
  };

  return {
    svgRef,
    index,
    clear: () => setIndex(null),
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerLeave, onKeyDown },
  };
}
