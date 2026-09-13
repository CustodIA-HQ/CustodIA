/**
 * Lives for this JS runtime only. A hard load or refresh creates a new
 * runtime, so the flag resets and the landing intro can play again.
 * Client-side Next.js navigation keeps the module, so returning to "/" skips.
 */
let spaHasRouted = false;

export function spaHasAlreadyRouted(): boolean {
  return spaHasRouted;
}

export function markSpaRouted(): void {
  spaHasRouted = true;
}

export function shouldForceHomeIntro(): boolean {
  const eye = new URLSearchParams(window.location.search).get("eye");
  return eye === "static" || eye === "closed" || eye === "hold";
}

export function shouldPlayHomeIntro(): boolean {
  return shouldForceHomeIntro() || !spaHasAlreadyRouted();
}
