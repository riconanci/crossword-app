// lib/sounds.ts
// Web Audio API sound effects — no external dependencies.
// All sounds are synthesized programmatically so there are no audio files to load.
// Respects a user preference stored in localStorage ("cw-sounds": "on" | "off").

const PREF_KEY = "cw-sounds";

export function getSoundsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const v = localStorage.getItem(PREF_KEY);
  return v === null ? true : v === "on"; // default on
}

export function setSoundsEnabled(on: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(PREF_KEY, on ? "on" : "off");
}

// Lazily created AudioContext (must be created after user gesture)
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try { ctx = new AudioContext(); } catch { return null; }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function tone(
  frequency: number,
  duration: number,
  type: OscillatorType = "sine",
  volume = 0.18,
  startDelay = 0
) {
  const c = getCtx();
  if (!c) return;
  const osc  = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, c.currentTime + startDelay);
  gain.gain.setValueAtTime(0, c.currentTime + startDelay);
  gain.gain.linearRampToValueAtTime(volume, c.currentTime + startDelay + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + startDelay + duration);
  osc.start(c.currentTime + startDelay);
  osc.stop(c.currentTime + startDelay + duration + 0.01);
}

function play(fn: () => void) {
  if (!getSoundsEnabled()) return;
  try { fn(); } catch {}
}

// ── Individual sounds ────────────────────────────────────────────────────────

/** Soft click when a letter key is pressed */
export function soundKeypress() {
  play(() => tone(900, 0.04, "triangle", 0.08));
}

/** Satisfying pop when a full word is completed correctly */
export function soundWordComplete() {
  play(() => {
    tone(523, 0.07, "sine", 0.14);           // C5
    tone(659, 0.07, "sine", 0.14, 0.07);     // E5
    tone(784, 0.12, "sine", 0.16, 0.14);     // G5
  });
}

/** Uplifting fanfare on win */
export function soundWin() {
  play(() => {
    tone(523, 0.1,  "sine", 0.18);
    tone(659, 0.1,  "sine", 0.18, 0.1);
    tone(784, 0.1,  "sine", 0.18, 0.2);
    tone(1047,0.25, "sine", 0.2,  0.3);
  });
}

/** Gentle sad tone on loss / gave up */
export function soundLoss() {
  play(() => {
    tone(440, 0.12, "sine", 0.14);
    tone(392, 0.2,  "sine", 0.14, 0.12);
  });
}

/** Low buzz when a check reveals wrong cells */
export function soundWrong() {
  play(() => {
    tone(180, 0.08, "sawtooth", 0.12);
    tone(160, 0.1,  "sawtooth", 0.1, 0.08);
  });
}

/** Short tick on backspace / delete */
export function soundDelete() {
  play(() => tone(400, 0.04, "triangle", 0.07));
}

/** Soft chime when a check comes back all correct (no wrong cells) */
export function soundCheckClear() {
  play(() => {
    tone(880, 0.08, "sine", 0.15);
    tone(1108,0.12, "sine", 0.15, 0.08);
  });
}
