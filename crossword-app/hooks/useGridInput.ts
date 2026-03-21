// hooks/useGridInput.ts
// Manages crossword grid interaction + clue navigation.
//
// Clue navigation rules (shared by typing, Tab, and prev/next buttons):
//   • When leaving a word (end-of-word or explicit nav), jump to next incomplete clue.
//   • "Incomplete" = at least one cell in the word is empty.
//   • If ALL remaining clues are complete, just go to the next one (puzzle is done).
//   • Prev button goes backward with the same skip logic.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Cell, Clue, Direction, Puzzle } from "@/lib/types";

export interface GridSelection {
  cellIndex: number | null;
  direction: Direction;
}

export interface UseGridInputReturn {
  selection: GridSelection;
  activeClue: Clue | null;
  activeWordCells: number[];
  selectCell: (cellIndex: number) => void;
  selectClue: (clue: Clue) => void;
  setDirection: (d: Direction) => void;
  handleKey: (key: string) => void;
  goNextClue: () => void;
  goPrevClue: () => void;
  gridRef: React.RefObject<HTMLDivElement | null>;
}

// ── Pure helpers (no hooks) ────────────────────────────────────────────────────

/** True if every cell in this clue has a non-empty letter */
function isComplete(clue: Clue, entries: Record<number, string>): boolean {
  return clue.cells.every((ci) => !!entries[ci]);
}

/**
 * Starting from `fromIdx` in `clues`, step by `delta` (+1 or -1) and return
 * the index of the first incomplete clue. If all are complete, returns the
 * simple next/prev index (so the user can still navigate).
 */
function findNextIncompleteIdx(
  clues: Clue[],
  fromIdx: number,
  entries: Record<number, string>,
  delta: 1 | -1
): number {
  const n = clues.length;
  // Try every clue once
  for (let step = 1; step <= n; step++) {
    const idx = ((fromIdx + delta * step) % n + n) % n;
    if (!isComplete(clues[idx]!, entries)) return idx;
  }
  // All complete — just return simple next/prev
  return ((fromIdx + delta + n) % n);
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useGridInput(
  puzzle: Puzzle | null,
  entries: Record<number, string>,
  onInput: (cellIndex: number, value: string) => void,
  onPresence?: (
    cellIndex: number | null,
    wordCells: number[],
    direction: Direction,
    clueLabel: string
  ) => void
): UseGridInputReturn {
  const [selection, setSelection] = useState<GridSelection>({
    cellIndex: null,
    direction: "across",
  });

  const gridRef = useRef<HTMLDivElement | null>(null);

  // ── Clue lookup ────────────────────────────────────────────────────────────

  const getActiveClue = useCallback(
    (sel: GridSelection): Clue | null => {
      if (!puzzle || sel.cellIndex === null) return null;
      const cell = puzzle.cells[sel.cellIndex];
      if (!cell) return null;

      const wordNum = sel.direction === "across" ? cell.acrossWord : cell.downWord;
      if (wordNum === null) {
        const otherDir: Direction = sel.direction === "across" ? "down" : "across";
        const otherNum = otherDir === "across" ? cell.acrossWord : cell.downWord;
        return puzzle.clues.find((c) => c.number === otherNum && c.direction === otherDir) ?? null;
      }
      return puzzle.clues.find((c) => c.number === wordNum && c.direction === sel.direction) ?? null;
    },
    [puzzle]
  );

  const activeClue = getActiveClue(selection);
  const activeWordCells = activeClue?.cells ?? [];

  // ── Navigate to a specific clue (jump to its first empty cell, else first cell) ──

  const jumpToClue = useCallback(
    (clue: Clue) => {
      // Prefer the first empty cell; fall back to first cell
      const target =
        clue.cells.find((ci) => !entries[ci]) ?? clue.cells[0];
      if (target !== undefined) {
        setSelection({ cellIndex: target, direction: clue.direction });
        gridRef.current?.focus();
      }
    },
    [entries]
  );

  // ── Next / prev incomplete clue ────────────────────────────────────────────

  const navigateClue = useCallback(
    (delta: 1 | -1) => {
      if (!puzzle) return;
      const clue = getActiveClue(selection);
      const clues = puzzle.clues;
      const currentIdx = clue
        ? clues.findIndex((c) => c.number === clue.number && c.direction === clue.direction)
        : -1;
      const fromIdx = currentIdx === -1 ? 0 : currentIdx;
      const nextIdx = findNextIncompleteIdx(clues, fromIdx, entries, delta);
      jumpToClue(clues[nextIdx]!);
    },
    [puzzle, selection, entries, getActiveClue, jumpToClue]
  );

  const goNextClue = useCallback(() => navigateClue(1), [navigateClue]);
  const goPrevClue = useCallback(() => navigateClue(-1), [navigateClue]);

  // ── selectCell ─────────────────────────────────────────────────────────────

  const selectCell = useCallback(
    (cellIndex: number) => {
      if (!puzzle) return;
      const cell = puzzle.cells[cellIndex];
      if (!cell || cell.isBlack) return;

      setSelection((prev) => {
        let dir = prev.direction;
        if (prev.cellIndex === cellIndex) {
          // Same cell tap → toggle direction if both exist
          if (cell.acrossWord !== null && cell.downWord !== null) {
            dir = dir === "across" ? "down" : "across";
          }
        } else {
          const hasDir = dir === "across" ? cell.acrossWord !== null : cell.downWord !== null;
          if (!hasDir) dir = dir === "across" ? "down" : "across";
        }
        return { cellIndex, direction: dir };
      });

      gridRef.current?.focus();
    },
    [puzzle]
  );

  const selectClue = useCallback(
    (clue: Clue) => jumpToClue(clue),
    [jumpToClue]
  );

  const setDirection = useCallback((d: Direction) => {
    setSelection((prev) => ({ ...prev, direction: d }));
  }, []);

  // ── handleKey ─────────────────────────────────────────────────────────────

  const handleKey = useCallback(
    (key: string) => {
      if (!puzzle || selection.cellIndex === null) return;
      const { size } = puzzle;

      // ── Letter input ──────────────────────────────────────────────────────
      if (/^[a-zA-Z]$/.test(key)) {
        const letter = key.toUpperCase();
        onInput(selection.cellIndex, letter);

        const clue = getActiveClue(selection);
        if (!clue) return;

        const posInWord = clue.cells.indexOf(selection.cellIndex);
        const isLastCell = posInWord === clue.cells.length - 1;

        if (isLastCell) {
          // Filled last cell of this word → go to next incomplete clue
          // (We pass entries with the just-typed letter included so we don't
          //  land back on this same clue if it's now complete.)
          const updatedEntries = { ...entries, [selection.cellIndex]: letter };
          const clues = puzzle.clues;
          const currentIdx = clues.findIndex(
            (c) => c.number === clue.number && c.direction === clue.direction
          );
          const nextIdx = findNextIncompleteIdx(clues, currentIdx, updatedEntries, 1);
          const nextClue = clues[nextIdx]!;
          const target = nextClue.cells.find((ci) => !updatedEntries[ci]) ?? nextClue.cells[0];
          if (target !== undefined) {
            setSelection({ cellIndex: target, direction: nextClue.direction });
          }
        } else {
          // Advance within this word: skip to next empty cell, else just move +1
          let nextCell: number | null = null;
          for (let i = posInWord + 1; i < clue.cells.length; i++) {
            const ci = clue.cells[i]!;
            if (!entries[ci]) { nextCell = ci; break; }
          }
          if (nextCell === null) nextCell = clue.cells[posInWord + 1] ?? null;
          if (nextCell !== null) {
            setSelection((prev) => ({ ...prev, cellIndex: nextCell! }));
          }
        }
        return;
      }

      // ── Backspace ─────────────────────────────────────────────────────────
      if (key === "Backspace") {
        if (entries[selection.cellIndex]) {
          onInput(selection.cellIndex, "");
        } else {
          const clue = getActiveClue(selection);
          if (clue) {
            const pos = clue.cells.indexOf(selection.cellIndex);
            if (pos > 0) {
              const prev = clue.cells[pos - 1]!;
              onInput(prev, "");
              setSelection((s) => ({ ...s, cellIndex: prev }));
            }
          }
        }
        return;
      }

      // ── Delete ────────────────────────────────────────────────────────────
      if (key === "Delete") { onInput(selection.cellIndex, ""); return; }

      // ── Arrow keys ────────────────────────────────────────────────────────
      const arrowMap: Record<string, { dir: Direction; delta: 1 | -1 }> = {
        ArrowRight: { dir: "across", delta: 1 },
        ArrowLeft:  { dir: "across", delta: -1 },
        ArrowDown:  { dir: "down",   delta: 1 },
        ArrowUp:    { dir: "down",   delta: -1 },
      };
      const arrow = arrowMap[key];
      if (arrow) {
        if (arrow.dir !== selection.direction) {
          const cell = puzzle.cells[selection.cellIndex];
          const hasDir = arrow.dir === "across" ? cell?.acrossWord !== null : cell?.downWord !== null;
          if (hasDir) { setSelection((prev) => ({ ...prev, direction: arrow.dir })); return; }
        }
        let idx = selection.cellIndex;
        if (arrow.dir === "across") {
          const ni = selection.cellIndex + arrow.delta;
          if (ni >= 0 && ni < size * size &&
              Math.floor(ni / size) === Math.floor(selection.cellIndex / size) &&
              !puzzle.cells[ni]?.isBlack) idx = ni;
        } else {
          const ni = selection.cellIndex + arrow.delta * size;
          if (ni >= 0 && ni < size * size && !puzzle.cells[ni]?.isBlack) idx = ni;
        }
        if (idx !== selection.cellIndex) setSelection((prev) => ({ ...prev, cellIndex: idx }));
        return;
      }

      // ── Tab — next / Shift+Tab — prev ─────────────────────────────────────
      if (key === "Tab") { goNextClue(); }
    },
    [puzzle, selection, entries, onInput, getActiveClue, goNextClue]
  );

  // ── Broadcast presence ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!onPresence || !activeClue) return;
    const label = `${activeClue.number}-${activeClue.direction === "across" ? "Across" : "Down"}`;
    onPresence(selection.cellIndex, activeWordCells, selection.direction, label);
  }, [selection, activeClue, activeWordCells, onPresence]);

  return {
    selection,
    activeClue,
    activeWordCells,
    selectCell,
    selectClue,
    setDirection,
    handleKey,
    goNextClue,
    goPrevClue,
    gridRef,
  };
}
