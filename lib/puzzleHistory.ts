// lib/puzzleHistory.ts
// Track which puzzles have been played to avoid repeats.
// Uses a "fingerprint" of the sorted answer words so the same word combination
// won't appear again. Stored in localStorage per board size.

import type { BoardSize } from "./types";

const KEY = (size: BoardSize) => `cw-history-${size}`;
const MAX_HISTORY = 20; // keep last 20 per size

/** Generate a short fingerprint from a puzzle's answers */
export function puzzleFingerprint(answers: Record<number, string>): string {
  return Object.values(answers).sort().join("");
}

export function getHistory(size: BoardSize): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY(size));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function addToHistory(size: BoardSize, fingerprint: string) {
  if (typeof window === "undefined") return;
  const history = getHistory(size);
  // Don't add duplicates
  if (history.includes(fingerprint)) return;
  const updated = [fingerprint, ...history].slice(0, MAX_HISTORY);
  try { localStorage.setItem(KEY(size), JSON.stringify(updated)); } catch {}
}

export function hasBeenPlayed(size: BoardSize, fingerprint: string): boolean {
  return getHistory(size).includes(fingerprint);
}
