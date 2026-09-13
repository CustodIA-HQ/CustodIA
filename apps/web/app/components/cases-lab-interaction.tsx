"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type CasesLabLayer = "sidebar" | "chart" | "idle";

type CasesLabInteraction = {
  layer: CasesLabLayer;
  sidebarActive: boolean;
  chartActive: boolean;
  chartsHeld: boolean;
  setNavHot: (hot: boolean) => void;
  setCategoryOpen: (id: string, open: boolean) => void;
  setChartExpanded: (expanded: boolean) => void;
  holdCharts: () => void;
};

const CasesLabInteractionContext = createContext<CasesLabInteraction>({
  layer: "idle",
  sidebarActive: false,
  chartActive: false,
  chartsHeld: false,
  setNavHot: () => undefined,
  setCategoryOpen: () => undefined,
  setChartExpanded: () => undefined,
  holdCharts: () => undefined,
});

function pointerInRect(x: number, y: number, rect: DOMRect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function CasesLabInteractionProvider({ children }: { children: ReactNode }) {
  const [navHot, setNavHot] = useState(false);
  const [openIds, setOpenIds] = useState<string[]>([]);
  const [chartCount, setChartCount] = useState(0);
  const [chartsHeld, setChartsHeld] = useState(false);

  const sidebarActive = navHot || openIds.length > 0;
  const chartActive = !sidebarActive && chartCount > 0;
  const layer: CasesLabLayer = sidebarActive ? "sidebar" : chartActive ? "chart" : "idle";

  useEffect(() => {
    document.body.classList.toggle("ux-layer-sidebar", layer === "sidebar");
    document.body.classList.toggle("has-ux-sidebar", layer === "sidebar");
    document.body.classList.toggle("ux-layer-chart", layer === "chart");
    document.body.classList.toggle("has-dash-zoom", layer === "chart");
    return () => {
      document.body.classList.remove(
        "ux-layer-sidebar",
        "has-ux-sidebar",
        "ux-layer-chart",
        "has-dash-zoom",
      );
    };
  }, [layer]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const nav = document.querySelector(".ux-lab__nav");
      if (nav && !nav.contains(event.target as Node)) setNavHot(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    if (!chartsHeld) return;
    const onMove = (event: PointerEvent) => {
      const overSlot = [...document.querySelectorAll(".dash-chart-slot")].some((slot) =>
        pointerInRect(event.clientX, event.clientY, slot.getBoundingClientRect()),
      );
      if (!overSlot) setChartsHeld(false);
    };
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [chartsHeld]);

  const setCategoryOpen = useCallback((id: string, open: boolean) => {
    setOpenIds((current) => {
      if (open) return current.includes(id) ? current : [...current, id];
      return current.filter((item) => item !== id);
    });
  }, []);

  const setChartExpanded = useCallback((expanded: boolean) => {
    setChartCount((count) => Math.max(0, count + (expanded ? 1 : -1)));
  }, []);

  const holdCharts = useCallback(() => setChartsHeld(true), []);

  const value = useMemo(
    () => ({
      layer,
      sidebarActive,
      chartActive,
      chartsHeld,
      setNavHot,
      setCategoryOpen,
      setChartExpanded,
      holdCharts,
    }),
    [layer, sidebarActive, chartActive, chartsHeld, setCategoryOpen, setChartExpanded, holdCharts],
  );

  return (
    <CasesLabInteractionContext.Provider value={value}>
      {children}
    </CasesLabInteractionContext.Provider>
  );
}

export function useCasesLabInteraction() {
  return useContext(CasesLabInteractionContext);
}

export function CasesLabNav({ children }: { children: ReactNode }) {
  const { chartActive, setNavHot } = useCasesLabInteraction();

  return (
    <nav
      className="ux-lab__nav"
      aria-label="Lab controls"
      onMouseEnter={() => {
        if (!chartActive) setNavHot(true);
      }}
      onMouseLeave={() => setNavHot(false)}
      onFocus={() => {
        if (!chartActive) setNavHot(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setNavHot(false);
        }
      }}
    >
      {children}
    </nav>
  );
}
