// components/CrosswordGrid.tsx
// Uses a visually hidden <input> to capture keyboard input.
// CRITICAL for iOS: inputRef.current?.focus() must be called synchronously
// inside the cell onClick handler (not in useEffect) for the native keyboard to appear.

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

  // Re-focus input when selectedCell changes (handles programmatic navigation
  // like Tab, arrow keys, clue panel clicks — NOT cell taps, those focus inline)
  useEffect(() => {
    if (selectedCell !== null) {
      inputRef.current?.focus();
    }
  }, [selectedCell]);

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const actionKeys = ["Backspace","Delete","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Tab"];
    if (e.key.length === 1 || actionKeys.includes(e.key)) {
      e.preventDefault();
    }
    onKeyDown?.(e);
  }

  // Mobile: onChange fires when user taps a key on the soft keyboard.
  // keydown is unreliable on iOS so we use this as the primary mobile path.
  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    // Clear immediately so repeated same-letter works
    e.target.value = "";
    if (!val) return;
    const letter = val[val.length - 1]!.toUpperCase();
    if (/^[A-Z]$/.test(letter)) {
      onKeyDown?.({ key: letter, preventDefault: () => {} } as React.KeyboardEvent);
    }
  }

  function handleCellClick(cellIndex: number) {
    // Focus the input SYNCHRONOUSLY here — iOS only shows the keyboard when
    // focus() is called directly inside a user gesture handler
    inputRef.current?.focus();
    onCellClick(cellIndex);
  }

  return (
    <div
      ref={gridRef as React.RefObject<HTMLDivElement>}
      className={styles.grid}
      style={{ "--grid-size": size } as React.CSSProperties}
      aria-label={`${size}×${size} crossword grid`}
      role="grid"
    >
      {/* Visually hidden input — positioned off-screen so browser treats it as
          interactive (avoids z-index issues that block keyboard events) */}
      <input
        ref={inputRef}
        className={styles.hiddenInput}
        type="text"
        inputMode="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="characters"
        spellCheck={false}
        tabIndex={-1}
        aria-label="crossword input"
        onKeyDown={handleInputKeyDown}
        onChange={handleInputChange}
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
            onClick={() => handleCellClick(cell.index)}
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
