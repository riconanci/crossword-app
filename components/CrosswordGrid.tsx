// components/CrosswordGrid.tsx — Full NYT-style interactive crossword grid
// Uses a hidden <input> to capture keyboard input on both desktop and mobile.
// The input is focused whenever a cell is selected, which triggers the native
// keyboard on iOS/Android and captures keystrokes on desktop.

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
  onKeyDown?: (e: React.KeyboardEvent) => void;
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

  // Focus the hidden input whenever a cell is selected.
  // This triggers the native keyboard on mobile and ensures keystrokes
  // are captured on desktop without needing to click the grid div.
  useEffect(() => {
    if (selectedCell !== null) {
      // Small timeout lets React finish rendering before focusing
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [selectedCell]);

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // Prevent default so browser doesn't insert characters into the input
    if (e.key.length === 1 || ["Backspace","Delete","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Tab"].includes(e.key)) {
      e.preventDefault();
    }
    onKeyDown?.(e);
  }

  // On mobile, the input fires an "input" event when the user types.
  // We intercept it here and translate it to a keydown-style call.
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    if (val.length > 0) {
      const key = val[val.length - 1]!.toUpperCase();
      if (/^[A-Z]$/.test(key)) {
        // Simulate a keydown event for the letter
        onKeyDown?.({ key, preventDefault: () => {} } as React.KeyboardEvent);
      }
    }
    // Always clear the input value so repeated letters work
    e.target.value = "";
  }

  return (
    <div
      ref={gridRef as React.RefObject<HTMLDivElement>}
      className={styles.grid}
      style={{ "--grid-size": size } as React.CSSProperties}
      aria-label={`${size}×${size} crossword grid`}
      role="grid"
    >
      {/* Hidden input captures keyboard on both desktop and mobile */}
      <input
        ref={inputRef}
        className={styles.hiddenInput}
        type="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        aria-hidden
        onKeyDown={handleInputKeyDown}
        onChange={handleInputChange}
        onBlur={() => {
          // Re-focus if a cell is still selected (e.g. user accidentally blurred)
          if (selectedCell !== null) {
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
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
            aria-label={`Row ${cell.row + 1} Col ${cell.col + 1}${letter ? `, letter ${letter}` : ""}${isCorrect ? ", correct" : ""}`}
            aria-selected={isSelected}
            onClick={() => onCellClick(cell.index)}
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
