// lib/demoMode.ts
// Simulates the PartyKit server locally when no connection is available.
// Runs the puzzle generator + state machine entirely client-side.
// Used for UI development without WSL/PartyKit running.

import { generatePuzzle } from "./puzzleGenerator";
import { CHECKS_PER_GAME } from "./constants";
import type {
  RoomState,
  GameMode,
  BoardSize,
  CellValue,
  VSPlayerState,
  TeamState,
  Puzzle,
} from "./types";

// Answers stored in module scope (never leave this file — mirrors server behaviour)
let _answers: Record<number, string> = {};

export function demoStartGame(
  playerId: string,
  playerName: string,
  mode: GameMode,
  size: BoardSize
): RoomState {
  const puzzleWithAnswers = generatePuzzle(size);
  _answers = puzzleWithAnswers.answers;

  // Strip answers before putting into room state
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { answers, ...puzzle } = puzzleWithAnswers;

  const vsState: Record<string, VSPlayerState> | null =
    mode === "vs"
      ? {
          [playerId]: {
            playerId,
            entries: {},
            progress: 0,
            checksRemaining: CHECKS_PER_GAME,
            lastActiveAt: Date.now(),
            isFinished: false,
            isCorrect: null,
            incorrectCells: [],
          },
          // Simulate a dummy opponent
          opponent: {
            playerId: "opponent",
            entries: {},
            progress: 0,
            checksRemaining: CHECKS_PER_GAME,
            lastActiveAt: Date.now(),
            isFinished: false,
            isCorrect: null,
            incorrectCells: [],
          },
        }
      : null;

  const teamState: TeamState | null =
    mode === "team"
      ? {
          entries: {},
          checksRemaining: CHECKS_PER_GAME,
          incorrectCells: [],
          presence: {},
          isComplete: false,
          isCorrect: null,
        }
      : null;

  return {
    roomId: "demo",
    mode,
    boardSize: size,
    phase: "playing",
    players: [
      { id: playerId, name: playerName || "You", joinedAt: Date.now(), isOnline: true },
      { id: "opponent", name: "Partner", joinedAt: Date.now(), isOnline: true },
    ],
    puzzle: puzzle as Puzzle,
    vsState,
    teamState,
    startedAt: Date.now(),
    finishedAt: null,
    winnerId: null,
    gaveUp: false,
  };
}

export function demoApplyCellInput(
  state: RoomState,
  playerId: string,
  cellIndex: number,
  value: CellValue
): RoomState {
  if (!state.puzzle) return state;
  const fillable = state.puzzle.cells.filter((c) => !c.isBlack);

  if (state.mode === "vs" && state.vsState) {
    const me = state.vsState[playerId];
    if (!me) return state;

    const entries = { ...me.entries, [cellIndex]: value };
    const filled = fillable.filter((c) => entries[c.index] && entries[c.index] !== "").length;
    const progress = Math.round((filled / fillable.length) * 100);

    const updatedMe: VSPlayerState = { ...me, entries, progress, lastActiveAt: Date.now() };

    let newState: RoomState = {
      ...state,
      vsState: { ...state.vsState, [playerId]: updatedMe },
    };

    // Auto-validate when 100% filled
    if (progress === 100 && !me.isFinished) {
      newState = demoValidate(newState, playerId);
    }
    return newState;
  }

  if (state.mode === "team" && state.teamState) {
    const entries = { ...state.teamState.entries, [cellIndex]: value };
    const filled = fillable.filter((c) => entries[c.index] && entries[c.index] !== "").length;
    const progress = Math.round((filled / fillable.length) * 100);

    let teamState: TeamState = { ...state.teamState, entries };
    let newState: RoomState = { ...state, teamState };

    if (progress === 100 && !teamState.isComplete) {
      newState = demoValidateTeam(newState);
    }
    return newState;
  }

  return state;
}

export function demoCheck(state: RoomState, playerId: string): RoomState {
  if (state.mode === "vs" && state.vsState) {
    const me = state.vsState[playerId];
    if (!me || me.checksRemaining <= 0) return state;

    const incorrectCells = findIncorrect(me.entries);
    const updated: VSPlayerState = {
      ...me,
      incorrectCells,
      checksRemaining: me.checksRemaining - 1,
    };
    return { ...state, vsState: { ...state.vsState, [playerId]: updated } };
  }

  if (state.mode === "team" && state.teamState) {
    const t = state.teamState;
    if (t.checksRemaining <= 0) return state;
    return {
      ...state,
      teamState: {
        ...t,
        incorrectCells: findIncorrect(t.entries),
        checksRemaining: t.checksRemaining - 1,
      },
    };
  }

  return state;
}

export function demoValidate(state: RoomState, playerId: string): RoomState {
  if (!state.vsState) return state;
  const me = state.vsState[playerId];
  if (!me) return state;

  const incorrect = findIncorrect(me.entries);
  const isCorrect = incorrect.length === 0;

  const updated: VSPlayerState = {
    ...me,
    isFinished: true,
    isCorrect,
    incorrectCells: incorrect,
  };

  let newState: RoomState = {
    ...state,
    vsState: { ...state.vsState, [playerId]: updated },
  };

  if (isCorrect) {
    newState = { ...newState, phase: "finished", winnerId: playerId, finishedAt: Date.now(), gaveUp: false };
  }

  return newState;
}

export function demoValidateTeam(state: RoomState): RoomState {
  if (!state.teamState) return state;
  const incorrect = findIncorrect(state.teamState.entries);
  const isCorrect = incorrect.length === 0;

  const teamState: TeamState = {
    ...state.teamState,
    isComplete: true,
    isCorrect,
    incorrectCells: incorrect,
  };

  if (isCorrect) {
    return { ...state, teamState, phase: "finished", finishedAt: Date.now(), gaveUp: false };
  }

  return { ...state, teamState };
}

export function demoRestart(playerId: string): Omit<RoomState, "puzzle" | "vsState" | "teamState"> {
  return {
    roomId: "demo",
    mode: "vs",
    boardSize: 7,
    phase: "lobby",
    players: [
      { id: playerId, name: "You", joinedAt: Date.now(), isOnline: true },
      { id: "opponent", name: "Partner", joinedAt: Date.now(), isOnline: true },
    ],
    startedAt: null,
    finishedAt: null,
    winnerId: null,
    gaveUp: false,
  };
}

function findIncorrect(entries: Record<number, CellValue>): number[] {
  return Object.entries(entries)
    .filter(([idx, val]) => val !== "" && val !== _answers[Number(idx)])
    .map(([idx]) => Number(idx));
}

export function demoGiveUp(state: RoomState, playerId: string): RoomState {
  const now = Date.now();
  const revealedEntries = { ..._answers };

  if (state.mode === "vs") {
    const opponent = state.players.find((p) => p.id !== playerId);
    // Fill in the local player's board with answers
    const vsState = state.vsState
      ? {
          ...state.vsState,
          [playerId]: state.vsState[playerId]
            ? { ...state.vsState[playerId]!, entries: revealedEntries }
            : state.vsState[playerId]!,
        }
      : state.vsState;
    return {
      ...state,
      phase: "finished",
      finishedAt: now,
      winnerId: opponent?.id ?? null,
      gaveUp: true,
      vsState,
    };
  }

  // Team mode — fill shared board with answers, no winner
  return {
    ...state,
    phase: "finished",
    finishedAt: now,
    winnerId: null,
    gaveUp: true,
    teamState: state.teamState
      ? { ...state.teamState, entries: revealedEntries }
      : state.teamState,
  };
}
