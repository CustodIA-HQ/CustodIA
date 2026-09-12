"use client";

/**
 * AnimatedAILogo — Minimal Tailwind-only loader.
 *
 * Three concentric layers:
 *   • Outer ring  — spins clockwise    (border-t-emerald-500)
 *   • Inner ring  — spins counter-CW  (border-b-amber-500)
 *   • Core        — pulses             (bg-zinc-300)
 */
export function AnimatedAILogo({ size = 28 }: { size?: number }) {
  const px = `${size}px`;
  const innerSize = `${Math.round(size * 0.62)}px`;
  const coreSize = `${Math.round(size * 0.28)}px`;

  return (
    <span
      aria-hidden="true"
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: px, height: px }}
    >
      {/* Outer ring — clockwise */}
      <span
        className="absolute inset-0 rounded-full border-2 border-transparent border-t-emerald-500 animate-spin"
        style={{ width: px, height: px }}
      />
      {/* Inner ring — counter-clockwise */}
      <span
        className="absolute rounded-full border-2 border-transparent border-b-amber-500"
        style={{
          width: innerSize,
          height: innerSize,
          animation: "spin 0.9s linear infinite reverse",
        }}
      />
      {/* Core pulse */}
      <span
        className="absolute rounded-full bg-zinc-300 animate-pulse"
        style={{ width: coreSize, height: coreSize }}
      />
    </span>
  );
}
