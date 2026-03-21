// components/CrosswordGrid.tsx
// Input: a transparent <input> positioned exactly over the selected cell.
// This is the most reliable approach on iOS — the input is literally ON the cell,
// so iOS always shows the keyboard and keystrokes are always captured.

"use client";

import { useEffect, useRef } from "react";
import type { Puzzle, Direction } from "@/lib/types";
import styles from "./CrosswordGrid.module.css";

interface Props {
  puzzle: Puzzle;
  entries: Record<number, string>;
  wrongCells?: number[];
  correctCells?: number[];
  partnerCells?: number[];
  selectedCell: number | null;
  direction: Direction;
  activeWordCells: number[];
  onCellClick: (cellIndex: number) => void;
  onKeyDown?: (e: { key: string; preventDefault: () => void }) => void;
  gridRef: React.RefObject<HTMLDivElement | null>;
}

export function CrosswordGrid({
  puzzle,
  entries,
  wrongCells = [],
  correctCells = [],
  partnerCells = [],
  selectedCell,
  direction,
  activeWordCells,
  onCellClick,
  onKeyDown,
  gridRef,
}: Props) {
  const { size, cells } = puzzle;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const onKeyDownRef = useRef(onKeyDown);
  useEffect(() => { onKeyDownRef.current = onKeyDown; }, [onKeyDown]);

  // Focus whenever selected cell changes
  useEffect(() => {
    if (selectedCell !== null) {
      inputRef.current?.focus();
    }
  }, [selectedCell]);

  // Native input listener — most reliable across iOS/Android/desktop
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    function onInput() {
      const val = el!.value;
      el!.value = "";
      if (!val) return;
      const ch = val[val.length - 1]!.toUpperCase();
      if (/^[A-Z]$/.test(ch)) {
        onKeyDownRef.current?.({ key: ch, preventDefault: () => {} });
      }
    }

    function onKeydown(e: KeyboardEvent) {
      const action = ["Backspace","Delete","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Tab"];
      if (action.includes(e.key)) {
        e.preventDefault();
        onKeyDownRef.current?.({ key: e.key, preventDefault: () => {} });
      } else if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
        // Desktop: handle letters via keydown, prevent input event double-fire
        e.preventDefault();
        onKeyDownRef.current?.({ key: e.key.toUpperCase(), preventDefault: () => {} });
      }
    }

    el.addEventListener("input", onInput);
    el.addEventListener("keydown", onKeydown);
    return () => {
      el.removeEventListener("input", onInput);
      el.removeEventListener("keydown", onKeydown);
    };
  }, []);

  return (
    <div
      ref={gridRef as React.RefObject<HTMLDivElement>}
      className={styles.grid}
      style={{ "--grid-size": size } as React.CSSProperties}
      aria-label={`${size}×${size} crossword grid`}
      role="grid"
    >
      {/* Input floats off-screen but stays fully interactive */}
      <input
        ref={inputRef}
        className={styles.hiddenInput}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        tabIndex={-1}
        readOnly={false}
        aria-label="crossword input"
      />

      {cells.map((cell) => {
        if (cell.isBlack) {
          return <div key={cell.index} className={styles.cellBlack} role="gridcell" aria-hidden />;
        }

        const isSelected  = cell.index === selectedCell;
        const isInWord    = activeWordCells.includes(cell.index);
        const isWrong     = wrongCells.includes(cell.index);
        const isCorrect   = correctCells.includes(cell.index);
        const isPartner   = partnerCells.includes(cell.index);
        const letter      = entries[cell.index] ?? "";

        const classes = [
          styles.cell,
          isSelected  ? styles.cellSelected  : null,
          !isSelected && isPartner ? styles.cellPartner : null,
          !isSelected && !isPartner && isInWord ? styles.cellInWord : null,
          isWrong     ? styles.cellWrong   : null,
          isCorrect   ? styles.cellCorrect : null,
        ].filter(Boolean).join(" ");

        return (
          <div
            key={cell.index}
            className={classes}
            role="gridcell"
            aria-label={`Row ${cell.row + 1} Col ${cell.col + 1}${letter ? `, letter ${letter}` : ""}`}
            aria-selected={isSelected}
            onClick={() => {
              // Sync focus for iOS keyboard
              inputRef.current?.focus();
              onCellClick(cell.index);
            }}
          >
            {cell.startNumber !== null && (
              <span className={styles.cellNum}>{cell.startNumber}</span>
            )}
            <span className={styles.cellLetter}>{letter}</span>
          </div>
        );
      })}
    </div>
  );
}
