// lib/stats.ts
// Per-player stats stored in localStorage.
// Shape: { wins, losses, currentStreak, bestStreak, gamesPlayed, bestTimes }

import type { BoardSize, PlayerStats } from "./types";

const KEY = (id: string) => `cw-stats-${id}`;

export function getStats(playerId: string): PlayerStats {
  if (typeof window === "undefined") return emptyStats(playerId);
  try {
    const raw = localStorage.getItem(KEY(playerId));
    if (raw) return { ...emptyStats(playerId), ...JSON.parse(raw) };
  } catch {}
  return emptyStats(playerId);
}

export function recordWin(
  playerId: string,
  boardSize: BoardSize,
  timeMs: number
): PlayerStats {
  const s = getStats(playerId);
  const newStreak = s.currentStreak + 1;
  const updated: PlayerStats = {
    ...s,
    wins: s.wins + 1,
    gamesPlayed: s.gamesPlayed + 1,
    currentStreak: newStreak,
    bestStreak: Math.max(s.bestStreak, newStreak),
    bestTimes: {
      ...s.bestTimes,
      [boardSize]:
        s.bestTimes[boardSize] == null
          ? timeMs
          : Math.min(s.bestTimes[boardSize]!, timeMs),
    },
  };
  save(playerId, updated);
  return updated;
}

export function recordLoss(playerId: string): PlayerStats {
  const s = getStats(playerId);
  const updated: PlayerStats = {
    ...s,
    losses: s.losses + 1,
    gamesPlayed: s.gamesPlayed + 1,
    currentStreak: 0,
  };
  save(playerId, updated);
  return updated;
}

function save(playerId: string, stats: PlayerStats) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY(playerId), JSON.stringify(stats));
  } catch {}
}

function emptyStats(playerId: string): PlayerStats {
  return {
    playerId,
    wins: 0,
    losses: 0,
    currentStreak: 0,
    bestStreak: 0,
    bestTimes: {},
    gamesPlayed: 0,
  };
}
