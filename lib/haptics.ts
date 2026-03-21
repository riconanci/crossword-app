// lib/haptics.ts
// Wrapper around navigator.vibrate for tactile feedback on mobile.
// Respects a user preference stored in localStorage ("cw-haptics": "on" | "off").

const PREF_KEY = "cw-haptics";

export function getHapticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const v = localStorage.getItem(PREF_KEY);
  return v === null ? true : v === "on"; // default on
}

export function setHapticsEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PREF_KEY, on ? "on" : "off");
}

function vibe(pattern: number | number[]) {
  if (!getHapticsEnabled()) return;
  if (typeof window === "undefined") return;
  try { navigator.vibrate?.(pattern); } catch {}
}

export const hapticKeypress    = () => vibe(8);           // very short tap
export const hapticWordComplete = () => vibe([20, 10, 20]); // double tap
export const hapticWin          = () => vibe([30, 40, 80]); // celebratory
export const hapticWrong        = () => vibe([60, 20, 60]); // error buzz
export const hapticDelete       = () => vibe(5);            // tiny blip
