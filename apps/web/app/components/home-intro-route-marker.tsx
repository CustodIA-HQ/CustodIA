"use client";

import { usePathname } from "next/navigation";
import { useLayoutEffect } from "react";
import { markSpaRouted } from "./home-intro-gate";

/** Hard entry on any internal route means a later visit to "/" is not a fresh load. */
export function HomeIntroRouteMarker() {
  const pathname = usePathname();

  useLayoutEffect(() => {
    if (pathname !== "/") {
      markSpaRouted();
    }
  }, [pathname]);

  return null;
}
