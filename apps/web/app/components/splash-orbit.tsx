"use client";

import { useEffect, useState } from "react";

// Hexagon of radius 6 centred on the origin.
const HEX = "M5.2 3 0 6-5.2 3v-6L0-6l5.2 3Z";
const ORBIT_R = 64;
const D = ORBIT_R * Math.SQRT1_2;
const NODES = [
  { x: 100 - D, y: 100 - D },
  { x: 100 + D, y: 100 - D },
  { x: 100 + D, y: 100 + D },
  { x: 100 - D, y: 100 + D },
];
const ELLIPSE_PATH = "M20 100a80 58 0 1 0 160 0a80 58 0 1 0-160 0";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/**
 * SplashOrbit — animated rebuild of the CustodIA splash mark:
 * a glowing "AI" core, a spinning scan arc, a rotating orbit of
 * hexagon nodes and a precessing ellipse with a travelling data packet.
 */
export function SplashOrbit() {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <svg className="splash-orbit" viewBox="0 0 200 200" role="img" aria-label="CustodIA Agent">
      <defs>
        <linearGradient id="splash-orbit-grad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#39ff14" />
          <stop offset="100%" stopColor="#22d3ee" />
        </linearGradient>
        <radialGradient id="splash-orbit-disc" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#0e1a24" />
          <stop offset="75%" stopColor="#0a111b" />
          <stop offset="100%" stopColor="#070b12" />
        </radialGradient>
        <filter id="splash-orbit-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle
        className="splash-orbit__disc"
        cx="100"
        cy="100"
        r="98"
        fill="url(#splash-orbit-disc)"
      />

      {/* Precessing ellipse with a data packet running along it */}
      <g className="splash-orbit__ellipse">
        <g transform="rotate(-35 100 100)">
          <path
            d={ELLIPSE_PATH}
            fill="none"
            stroke="#22d3ee"
            strokeOpacity="0.35"
            strokeWidth="0.8"
          />
          {!reducedMotion && (
            <circle r="2.2" fill="#22d3ee" filter="url(#splash-orbit-glow)">
              <animateMotion dur="3.2s" repeatCount="indefinite" path={ELLIPSE_PATH} />
            </circle>
          )}
        </g>
      </g>

      {/* Main orbit with hexagon nodes */}
      <g className="splash-orbit__ring">
        <circle
          cx="100"
          cy="100"
          r={ORBIT_R}
          fill="none"
          stroke="url(#splash-orbit-grad)"
          strokeOpacity="0.7"
          strokeWidth="0.9"
        />
        {NODES.map((node, index) => (
          <g key={index} transform={`translate(${node.x} ${node.y})`}>
            <path
              className="splash-orbit__node"
              style={{ animationDelay: `${index * 0.35}s` }}
              d={HEX}
              fill="url(#splash-orbit-grad)"
              filter="url(#splash-orbit-glow)"
            />
          </g>
        ))}
        <path
          d={`M${100 + ORBIT_R} ${100 - 5}l5 8.5h-10Z`}
          fill="url(#splash-orbit-grad)"
          filter="url(#splash-orbit-glow)"
        />
      </g>

      {/* Scan arc around the core */}
      <circle
        className="splash-orbit__scan"
        cx="100"
        cy="100"
        r="38"
        fill="none"
        stroke="url(#splash-orbit-grad)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeDasharray="42 197"
      />

      {/* Core */}
      <g className="splash-orbit__core" filter="url(#splash-orbit-glow)">
        <circle
          cx="100"
          cy="100"
          r="29"
          fill="none"
          stroke="url(#splash-orbit-grad)"
          strokeWidth="3.6"
        />
        <text
          x="100"
          y="100"
          dy="0.35em"
          textAnchor="middle"
          fill="url(#splash-orbit-grad)"
          fontFamily="Inter, 'Segoe UI', system-ui, sans-serif"
          fontSize="20"
          fontWeight="500"
        >
          AI
        </text>
      </g>
    </svg>
  );
}
