"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCasesLabInteraction } from "./cases-lab-interaction";

function useFineHover() {
  const [fine, setFine] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(hover: hover) and (pointer: fine)");
    const sync = () => setFine(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return fine;
}

export function DashboardChartCard({ children }: { children: ReactNode }) {
  const fineHover = useFineHover();
  const { sidebarActive, chartsHeld, setChartExpanded, holdCharts } = useCasesLabInteraction();
  const slotRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [slot, setSlot] = useState({ width: 0, height: 0 });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    setChartExpanded(true);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setExpanded(false);
        holdCharts();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      setChartExpanded(false);
      window.removeEventListener("keydown", onKey);
    };
  }, [expanded, holdCharts, setChartExpanded]);

  useEffect(() => {
    if (!sidebarActive || !expanded) return;
    setExpanded(false);
    holdCharts();
  }, [expanded, holdCharts, sidebarActive]);

  const expand = () => {
    if (!fineHover || sidebarActive || chartsHeld || expanded || !slotRef.current) return;
    const rect = slotRef.current.getBoundingClientRect();
    setSlot({ width: rect.width, height: rect.height });
    setExpanded(true);
  };

  const collapse = () => {
    setExpanded(false);
    holdCharts();
  };

  return (
    <div
      ref={slotRef}
      className="dash-chart-slot"
      style={expanded && slot.width > 0 ? { width: slot.width, height: slot.height } : undefined}
    >
      <button
        type="button"
        className={[
          "dash-chart",
          expanded || chartsHeld || sidebarActive ? "dash-chart--inert" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        tabIndex={fineHover ? 0 : -1}
        aria-expanded={expanded}
        aria-label="Expand chart"
        onMouseEnter={expand}
      >
        {expanded ? null : children}
      </button>
      {mounted && expanded
        ? createPortal(
            <>
              <div className="dash-chart-zoom__scrim" aria-hidden="true" />
              <button
                type="button"
                className="dash-chart dash-chart--zoom"
                aria-label="Collapse chart"
                onMouseLeave={collapse}
              >
                {children}
              </button>
            </>,
            document.body,
          )
        : null}
    </div>
  );
}
