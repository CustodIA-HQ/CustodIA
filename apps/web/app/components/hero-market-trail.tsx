const TRAIL_PATH =
  "M -40 206 L 38 198 L 78 142 L 112 176 L 154 78 L 188 118 L 226 36 L 264 72 L 302 168 L 338 132 L 374 232 L 418 188 L 458 236 L 502 164 L 540 44 L 578 96 L 616 22 L 654 68 L 694 186 L 732 148 L 772 28 L 812 70 L 852 132 L 890 84 L 930 176 L 968 138 L 1010 62 L 1052 108 L 1156 146";

const NODES = [
  { x: 154, y: 78, accent: false },
  { x: 226, y: 36, accent: true },
  { x: 374, y: 232, accent: false },
  { x: 540, y: 44, accent: false },
  { x: 616, y: 22, accent: true },
  { x: 772, y: 28, accent: true },
  { x: 930, y: 176, accent: false },
  { x: 1010, y: 62, accent: false },
] as const;

export function HeroMarketTrail() {
  return (
    <figure className="hero-market-trail" aria-hidden="true">
      <svg
        className="hero-market-trail__svg"
        viewBox="0 0 1100 260"
        fill="none"
        preserveAspectRatio="xMidYMid meet"
      >
        <path className="hero-market-trail__ghost" d={TRAIL_PATH} />
        <path className="hero-market-trail__line" d={TRAIL_PATH} pathLength="1" />
        <g className="hero-market-trail__nodes">
          {NODES.map((node) => (
            <circle
              key={`${node.x}-${node.y}`}
              className={
                node.accent
                  ? "hero-market-trail__node hero-market-trail__node--accent"
                  : "hero-market-trail__node"
              }
              cx={node.x}
              cy={node.y}
              r={node.accent ? 5 : 3.4}
            />
          ))}
        </g>
        <g className="hero-market-trail__pulse">
          <circle className="hero-market-trail__pulse-halo" r="16" cx="0" cy="0" />
          <circle className="hero-market-trail__pulse-mid" r="7" cx="0" cy="0" />
          <circle className="hero-market-trail__pulse-core" r="4.2" cx="0" cy="0" />
          <animateMotion
            dur="7.2s"
            begin="3.6s"
            repeatCount="indefinite"
            rotate="auto"
            path={TRAIL_PATH}
            calcMode="spline"
            keyTimes="0;1"
            keySplines="0.4 0 0.2 1"
          />
        </g>
      </svg>
    </figure>
  );
}
