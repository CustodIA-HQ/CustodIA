"use client";

import { type ReactNode, useEffect, useId, useState } from "react";
import { useCasesLabInteraction } from "./cases-lab-interaction";

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(hover: none), (pointer: coarse)");
    const sync = () => setCoarse(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return coarse;
}

export function SidebarCategory({
  legend,
  value,
  children,
}: {
  legend: string;
  value: string;
  children: ReactNode;
}) {
  const coarse = useCoarsePointer();
  const { setCategoryOpen } = useCasesLabInteraction();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    setCategoryOpen(legend, true);
    return () => setCategoryOpen(legend, false);
  }, [legend, open, setCategoryOpen]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = document.getElementById(panelId)?.parentElement;
      if (root && !root.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, panelId]);

  const openMenu = () => {
    if (!coarse) setOpen(true);
  };

  const closeMenu = () => {
    if (!coarse) setOpen(false);
  };

  return (
    <div className={["ux-cat", open ? "ux-cat--open" : ""].filter(Boolean).join(" ")}>
      <button
        type="button"
        className="ux-cat__trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          if (coarse) setOpen((current) => !current);
        }}
        onFocus={openMenu}
        onMouseEnter={openMenu}
        onMouseLeave={(event) => {
          const next = event.relatedTarget as Node | null;
          const panel = event.currentTarget.parentElement?.querySelector(`#${CSS.escape(panelId)}`);
          if (!panel || !next || !panel.contains(next)) closeMenu();
        }}
        onBlur={(event) => {
          const next = event.relatedTarget as Node | null;
          if (!event.currentTarget.parentElement?.contains(next)) setOpen(false);
        }}
      >
        <span className="ux-cat__legend">{legend}</span>
        <span className="ux-cat__value">{value}</span>
      </button>
      <fieldset
        className="ux-cat__flyout"
        id={panelId}
        onMouseEnter={openMenu}
        onMouseLeave={closeMenu}
      >
        <legend className="sr-only">{legend}</legend>
        {children}
      </fieldset>
    </div>
  );
}
