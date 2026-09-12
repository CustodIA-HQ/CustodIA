"use client";

import { useId, useState } from "react";

/**
 * One signed boundary (label + value). Tapping reveals what the boundary means
 * at today's price — a real <button> so it works with keyboard and screen readers.
 */
export function BoundaryTile({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!detail) {
    return (
      <div className="guard-boundary">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    );
  }
  return (
    <button
      type="button"
      className={
        open
          ? "guard-boundary guard-boundary--button guard-boundary--open"
          : "guard-boundary guard-boundary--button"
      }
      aria-expanded={open}
      aria-controls={id}
      onClick={() => setOpen((current) => !current)}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      <small id={id} hidden={!open}>
        {detail}
      </small>
    </button>
  );
}
