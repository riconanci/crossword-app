// components/CrosswordGrid.tsx
// iOS input fix: use onTouchStart (not onClick) to call focus() synchronously.
// iOS only shows the keyboard if focus() is called during a touchstart handler.
// By the time 'click' fires, iOS has already decided not to show the keyboard.

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

  // Re-focus on programmatic selection changes (arrow keys, clue panel)
  useEffect(() => {
    if (selectedCell !== null) {
      inputRef.current?.focus();
    }
  }, [selectedCell]);

  // Native event listeners — most reliable across all browsers + iOS
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    function onNativeInput() {
      const val = el!.value;
      el!.value = "";
      if (!val) return;
      const ch = val[val.length - 1]!.toUpperCase();
      if (/^[A-Z]$/.test(ch)) {
        onKeyDownRef.current?.({ key: ch, preventDefault: () => {} });
      }
    }

    function onNativeKeydown(e: KeyboardEvent) {
      const actionKeys = ["Backspace","Delete","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Tab"];
      if (actionKeys.includes(e.key)) {
        e.preventDefault();
        onKeyDownRef.current?.({ key: e.key, preventDefault: () => {} });
      } else if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
        // Desktop: handle here and prevent 'input' event double-fire
        e.preventDefault();
        onKeyDownRef.current?.({ key: e.key.toUpperCase(), preventDefault: () => {} });
      }
      // On iOS soft keyboard, keydown fires with 'Unidentified' — falls through to 'input'
    }

    el.addEventListener("input", onNativeInput);
    el.addEventListener("keydown", onNativeKeydown);
    return () => {
      el.removeEventListener("input", onNativeInput);
      el.removeEventListener("keydown", onNativeKeydown);
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
            // onTouchStart: focus MUST happen here for iOS to show keyboard.
            // 'click' fires too late — iOS has already decided not to show keyboard by then.
            onTouchStart={(e) => {
              e.preventDefault(); // prevents ghost click + double-fire
              inputRef.current?.focus();
              onCellClick(cell.index);
            }}
            onClick={() => {
              // Desktop fallback (touch devices use onTouchStart above)
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
