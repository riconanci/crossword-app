// lib/constants.ts

import type { BoardSize, GameMode } from "./types";

export const ROOM_ID = "me-and-gf" as const;

export const BOARD_SIZES: BoardSize[] = [5, 7, 11];

export const GAME_MODES: { value: GameMode; label: string; description: string }[] = [
  {
    value: "vs",
    label: "VS",
    description: "Race to finish your own board first",
  },
  {
    value: "team",
    label: "Team",
    description: "Solve one shared board together",
  },
];

export const CHECKS_PER_GAME = 2;
export const ACTIVE_TIMEOUT_MS = 5_000; // opponent is "active" within this window

/** Default board size for new games */
export const DEFAULT_BOARD_SIZE: BoardSize = 7;

/** PartyKit host — set NEXT_PUBLIC_PARTYKIT_HOST in .env.local */
export const PARTYKIT_HOST =
  process.env.NEXT_PUBLIC_PARTYKIT_HOST ?? "127.0.0.1:1999";
