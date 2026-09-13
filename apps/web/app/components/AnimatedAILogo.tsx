"use client";

/**
 * AnimatedAILogo — loader aligned to the black / white / accent tokens.
 *
 * Three concentric layers:
 *   • Outer ring  — accent
 *   • Inner ring  — white
 *   • Core        — white
 */
export function AnimatedAILogo({ size = 28 }: { size?: number }) {
  const px = `${size}px`;
  const innerSize = `${Math.round(size * 0.62)}px`;
  const coreSize = `${Math.round(size * 0.28)}px`;

  return (
    <span className="ai-logo" aria-hidden="true" style={{ width: px, height: px }}>
      <span className="ai-logo__ring ai-logo__ring--outer" style={{ width: px, height: px }} />
      <span
        className="ai-logo__ring ai-logo__ring--inner"
        style={{ width: innerSize, height: innerSize }}
      />
      <span className="ai-logo__core" style={{ width: coreSize, height: coreSize }} />
    </span>
  );
}
