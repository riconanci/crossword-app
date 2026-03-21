// lib/stats.ts
// Pair-level stats stored in localStorage — both players tracked on each device.
// Since the app is 2-player only, we record results for both players when a game ends.
// This means the stats page on either device shows the full picture.

import type { BoardSize, GameMode } from "./types";

// ─── Shape ───────────────────────────────────────────────────────────────────

export interface SizeStats {
  played: number;
  won: number;
  forfeits: number;
}

export interface ModeStats {
  played: number;
  won: number;
  forfeits: number;
  bySize: Partial<Record<BoardSize, SizeStats>>;
}

export interface PlayerRecord {
  playerId: string;
  playerName: string;
  vs: ModeStats;
  team: ModeStats;
  /** Best solve time per board size (winner's time, in ms) */
  bestTimes: Partial<Record<BoardSize, number>>;
}

// The single key for all pair stats
const PAIR_KEY = "cw-pair-stats";

// ─── Read / Write ─────────────────────────────────────────────────────────────

export function getPairStats(): Record<string, PlayerRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PAIR_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePairStats(pair: Record<string, PlayerRecord>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(PAIR_KEY, JSON.stringify(pair));
  } catch {}
}

function emptyModeStats(): ModeStats {
  return { played: 0, won: 0, forfeits: 0, bySize: {} };
}

function emptyRecord(playerId: string, playerName: string): PlayerRecord {
  return { playerId, playerName, vs: emptyModeStats(), team: emptyModeStats(), bestTimes: {} };
}

function getOrCreate(pair: Record<string, PlayerRecord>, id: string, name: string): PlayerRecord {
  if (!pair[id]) pair[id] = emptyRecord(id, name);
  // Always update name in case it changed
  pair[id]!.playerName = name || pair[id]!.playerName;
  return pair[id]!;
}

function addResult(mode: ModeStats, size: BoardSize, won: boolean, forfeit: boolean = false) {
  mode.played++;
  if (won) mode.won++;
  if (forfeit) mode.forfeits++;
  if (!mode.bySize[size]) mode.bySize[size] = { played: 0, won: 0, forfeits: 0 };
  mode.bySize[size]!.played++;
  if (won) mode.bySize[size]!.won++;
  if (forfeit) mode.bySize[size]!.forfeits++;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Record a completed game for BOTH players at once.
 * Called on the device that sees the result (both devices see gameOver).
 */
export function recordGameResult(
  myId: string,
  myName: string,
  opponentId: string,
  opponentName: string,
  mode: GameMode,
  size: BoardSize,
  iWon: boolean,  // true = myId won
  gaveUp: boolean = false,
  completionMs: number = 0
) {
  const pair = getPairStats();
  const me  = getOrCreate(pair, myId, myName);
  const opp = getOrCreate(pair, opponentId, opponentName);

  if (mode === "vs") {
    const myForfeit  = gaveUp && !iWon;
    const oppForfeit = gaveUp && iWon;
    addResult(me.vs,  size, iWon,  myForfeit);
    addResult(opp.vs, size, !iWon, oppForfeit);
  } else {
    addResult(me.team,  size, iWon, gaveUp);
    addResult(opp.team, size, iWon, gaveUp);
  }

  // Track best time for the winner (non-forfeit only)
  if (iWon && !gaveUp && completionMs > 0) {
    if (!me.bestTimes) me.bestTimes = {};
    const prev = me.bestTimes[size];
    me.bestTimes[size] = prev == null ? completionMs : Math.min(prev, completionMs);
  }

  savePairStats(pair);
}

/** Get one player's record (or a blank one) */
export function getPlayerRecord(playerId: string): PlayerRecord | null {
  return getPairStats()[playerId] ?? null;
}

/** Clear all stats — useful for testing */
export function clearAllStats() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(PAIR_KEY);
}
