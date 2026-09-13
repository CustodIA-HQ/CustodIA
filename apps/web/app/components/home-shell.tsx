"use client";

import { type ReactNode, useLayoutEffect, useState } from "react";
import { FalconEyeIntro } from "./FalconEyeIntro";
import { markSpaRouted, shouldPlayHomeIntro } from "./home-intro-gate";

type Phase = "cover" | "intro" | "live";

export function HomeShell({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>("cover");

  useLayoutEffect(() => {
    const play = shouldPlayHomeIntro();
    markSpaRouted();
    setPhase(play ? "intro" : "live");
  }, []);

  const showIntro = phase !== "live";

  return (
    <>
      {showIntro ? <FalconEyeIntro onDone={() => setPhase("live")} /> : null}
      <div
        className="home-shell__page"
        style={phase === "cover" ? { visibility: "hidden" } : undefined}
        aria-hidden={showIntro}
      >
        {children}
      </div>
    </>
  );
}
