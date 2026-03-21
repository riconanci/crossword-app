// =============================================================================
// lib/types.ts — All shared types for crossword game state + message protocol
// =============================================================================

// ─── Primitives ───────────────────────────────────────────────────────────────

export type BoardSize = 5 | 7 | 11;
export type GameMode = "vs" | "team";
export type Direction = "across" | "down";
export type CellValue = string; // single uppercase letter or "" (empty)
export type GamePhase = "lobby" | "playing" | "finished";

// ─── Puzzle / Grid ────────────────────────────────────────────────────────────

export interface Cell {
  index: number;         // flat index: row * size + col
  row: number;
  col: number;
  isBlack: boolean;
  /** Which "across" word number this cell belongs to (1-indexed clue number) */
  acrossWord: number | null;
  /** Which "down" word number this cell belongs to */
  downWord: number | null;
  /** Clue number printed in top-left corner of cell (e.g. 1, 2, 3…) */
  startNumber: number | null;
}

export interface Clue {
  number: number;
  direction: Direction;
  text: string;
  /** All flat cell indices belonging to this clue, in order */
  cells: number[];
  startCell: number;
  length: number;
}

/** Puzzle sent to clients — answer stripped server-side */
export interface Puzzle {
  id: string;
  size: BoardSize;
  cells: Cell[];
  clues: Clue[];
  createdAt: number;
}

/** Full puzzle kept on server — includes answers for validation */
export interface PuzzleWithAnswers extends Puzzle {
  answers: Record<number, string>; // cellIndex → correct letter
}

// ─── Players ──────────────────────────────────────────────────────────────────

export interface Player {
  id: string;          // PartyKit connection id
  name: string;        // "Player A" | "Player B"
  joinedAt: number;
  isOnline: boolean;
}

// ─── Stats (persisted in localStorage) ───────────────────────────────────────

export interface PlayerStats {
  playerId: string;
  wins: number;
  losses: number;
  currentStreak: number;
  bestStreak: number;
  bestTimes: Partial<Record<BoardSize, number>>; // ms
  gamesPlayed: number;
}

// ─── VS Mode State ────────────────────────────────────────────────────────────

export interface VSPlayerState {
  playerId: string;
  /** cellIndex → letter typed by this player */
  entries: Record<number, CellValue>;
  /** Percentage of non-black cells filled (0–100) */
  progress: number;
  checksRemaining: number; // starts at 2
  lastActiveAt: number;
  isFinished: boolean;
  /** null = not yet validated; true/false = result */
  isCorrect: boolean | null;
  /** Cells flagged wrong on last check (indices) */
  incorrectCells: number[];
}

// ─── Team Mode State ──────────────────────────────────────────────────────────

export interface TeamPresence {
  playerId: string;
  focusedCellIndex: number | null;
  /** All cell indices of the word the player is currently working on */
  focusedWordCells: number[];
  direction: Direction;
  /** Human-readable label, e.g. "12-Across" */
  activeClueLabel: string;
}

export interface TeamState {
  /** Shared entries — both players write here */
  entries: Record<number, CellValue>;
  checksRemaining: number; // 2 shared checks
  /** Cells flagged wrong on last check */
  incorrectCells: number[];
  /** playerId → presence info */
  presence: Record<string, TeamPresence>;
  isComplete: boolean;
  isCorrect: boolean | null;
}

// ─── Room State (authoritative on server) ─────────────────────────────────────

export interface RoomState {
  roomId: string;
  mode: GameMode;
  boardSize: BoardSize;
  phase: GamePhase;
  players: Player[];
  puzzle: Puzzle | null;
  /** null when in team mode */
  vsState: Record<string, VSPlayerState> | null;
  /** null when in vs mode */
  teamState: TeamState | null;
  startedAt: number | null;
  finishedAt: number | null;
  winnerId: string | null;
  /** True when game ended via give-up rather than correct completion */
  gaveUp: boolean;
}

// ─── Client → Server Messages ─────────────────────────────────────────────────

export type C2SMessage =
  | {
      type: "join";
      playerId: string;
      playerName: string;
    }
  | {
      type: "startGame";
      mode: GameMode;
      size: BoardSize;
    }
  | {
      /** Used in both VS and Team modes — server routes correctly */
      type: "cellInput";
      cellIndex: number;
      value: CellValue;
    }
  | {
      type: "requestCheck";
    }
  | {
      type: "requestValidate";
    }
  | {
      /** Team mode presence broadcast */
      type: "presenceUpdate";
      cellIndex: number | null;
      wordCells: number[];
      direction: Direction;
      clueLabel: string;
    }
  | {
      type: "requestRestart";
    }
  | {
      type: "requestGiveUp";
    };

// ─── Server → Client Messages ─────────────────────────────────────────────────

export type S2CMessage =
  | {
      /** Full state snapshot — sent on join + after major transitions */
      type: "roomState";
      state: RoomState;
    }
  | {
      type: "playerJoined";
      player: Player;
    }
  | {
      type: "playerLeft";
      playerId: string;
    }
  | {
      type: "gameStarted";
      puzzle: Puzzle;
      vsState: Record<string, VSPlayerState> | null;
      teamState: TeamState | null;
      startedAt: number;
    }
  | {
      /** VS: opponent made a cell entry (used to track their progress) */
      type: "vsProgressUpdate";
      playerId: string;
      progress: number;
      lastActiveAt: number;
      /** True while the opponent has had activity in last 5s */
      isActive: boolean;
    }
  | {
      /** Team: a cell was updated on the shared board */
      type: "teamEntryUpdate";
      playerId: string;
      cellIndex: number;
      value: CellValue;
    }
  | {
      type: "checkResult";
      playerId: string;
      /** Indices of cells with wrong letters */
      incorrectCells: number[];
      checksRemaining: number;
    }
  | {
      type: "validateResult";
      playerId: string;
      isCorrect: boolean;
      isWinner: boolean;
      /** Cells still wrong — so player can see what to fix */
      incorrectCells: number[];
    }
  | {
      /** Team mode: partner moved focus */
      type: "presenceUpdate";
      playerId: string;
      presence: TeamPresence;
    }
  | {
      type: "gameOver";
      winnerId: string | null;
      winnerName: string | null;
      completionTimeMs: number;
      gaveUp: boolean;
      /** Filled when gaveUp=true so clients can show the solved board */
      revealedEntries: Record<number, string>;
    }
  | {
      type: "error";
      message: string;
    };
