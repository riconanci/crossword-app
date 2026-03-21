// components/CrosswordGrid.tsx
// Input strategy:
//   Desktop: onKeyDown fires reliably — we forward directly to handleKey.
//   iOS/Android: keydown is unreliable for composition. We use a native
//   'input' event listener (not React synthetic) to read typed characters.
//   focus() is called SYNCHRONOUSLY inside onClick to trigger iOS keyboard.

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
  onKeyDown?: (e: React.KeyboardEvent | { key: string; preventDefault: () => void }) => void;
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
  // Keep a stable ref to onKeyDown so the native listener can access it
  const onKeyDownRef = useRef(onKeyDown);
  useEffect(() => { onKeyDownRef.current = onKeyDown; }, [onKeyDown]);

  // Attach a native (non-React) 'input' event listener for mobile.
  // This fires AFTER the keyboard commits a character — more reliable than
  // React's synthetic onChange on iOS with autocapitalize.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    function handleNativeInput() {
      const val = el!.value;
      el!.value = ""; // clear immediately so same letter can be typed again
      if (!val) return;
      // Read last character — handles both direct input and autocapitalize
      const ch = val[val.length - 1]!.toUpperCase();
      if (/^[A-Z]$/.test(ch)) {
        onKeyDownRef.current?.({ key: ch, preventDefault: () => {} });
      }
    }

    el.addEventListener("input", handleNativeInput);
    return () => el.removeEventListener("input", handleNativeInput);
  }, []); // only once — stable via ref

  // Re-focus when selection changes programmatically (arrow keys, tab, clue click)
  useEffect(() => {
    if (selectedCell !== null) {
      inputRef.current?.focus();
    }
  }, [selectedCell]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const actionKeys = [
      "Backspace","Delete","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Tab"
    ];
    if (e.key.length === 1 || actionKeys.includes(e.key)) {
      e.preventDefault();
    }
    // Letter keys on desktop are handled here via keydown (reliable on desktop)
    if (e.key.length === 1 || actionKeys.includes(e.key)) {
      onKeyDown?.(e);
    }
  }

  function handleCellClick(cellIndex: number) {
    // MUST call focus() synchronously here — iOS only shows keyboard
    // when focus() is inside a direct user gesture handler
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
      {/* Hidden input — positioned off-screen, fully interactive */}
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
        aria-label="crossword letter input"
        onKeyDown={handleKeyDown}
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
