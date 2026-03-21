// lib/sounds.ts
// Minimal, clean sound effects via Web Audio API. No files, no dependencies.
// Inspired by apps like Wordle/NYT — subtle confirmation tones, not game-show effects.

const PREF_KEY = "cw-sounds";

export function getSoundsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return (localStorage.getItem(PREF_KEY) ?? "on") === "on";
}
export function setSoundsEnabled(on: boolean) {
  if (typeof window !== "undefined") localStorage.setItem(PREF_KEY, on ? "on" : "off");
}

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) { try { ctx = new AudioContext(); } catch { return null; } }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function beep(freq: number, dur: number, vol = 0.12, type: OscillatorType = "sine", delay = 0) {
  if (!getSoundsEnabled()) return;
  const c = getCtx(); if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain); gain.connect(c.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + delay);
  gain.gain.setValueAtTime(0, c.currentTime + delay);
  gain.gain.linearRampToValueAtTime(vol, c.currentTime + delay + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + delay + dur);
  osc.start(c.currentTime + delay);
  osc.stop(c.currentTime + delay + dur + 0.01);
}

// Very soft tick — barely there, just tactile feedback
export function soundKeypress() {
  beep(1200, 0.03, 0.05, "triangle");
}

// Gentle two-note chime — word done
export function soundWordComplete() {
  beep(660, 0.08, 0.10, "sine");
  beep(880, 0.1,  0.10, "sine", 0.07);
}

// Clean, quiet win — two rising notes
export function soundWin() {
  beep(660,  0.1,  0.12, "sine");
  beep(880,  0.1,  0.12, "sine", 0.1);
  beep(1100, 0.18, 0.14, "sine", 0.2);
}

// Soft low thud — wrong answer
export function soundWrong() {
  beep(200, 0.12, 0.10, "sine");
}

// Single quiet tap — delete
export function soundDelete() {
  beep(500, 0.03, 0.06, "triangle");
}

// Short clean chime — check passed
export function soundCheckClear() {
  beep(880,  0.08, 0.10, "sine");
  beep(1100, 0.12, 0.10, "sine", 0.08);
}

// Soft descending note — gave up / loss
export function soundLoss() {
  beep(440, 0.1,  0.10, "sine");
  beep(350, 0.15, 0.10, "sine", 0.1);
}
