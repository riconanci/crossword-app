// components/CrosswordGrid.tsx
// On desktop: uses a hidden <input> for keyboard capture.
// On mobile: no input needed — MobileKeyboard component handles all key events.
// Cell clicks just select the cell; no focus tricks required.

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

  // Focus hidden input on desktop when selection changes
  useEffect(() => {
    if (selectedCell !== null && inputRef.current) {
      // Only focus if NOT a touch device (touch uses MobileKeyboard instead)
      const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
      if (!isTouch) inputRef.current.focus();
    }
  }, [selectedCell]);

  // Desktop keyboard capture via hidden input
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    function onNativeKeydown(e: KeyboardEvent) {
      const actionKeys = ["Backspace","Delete","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Tab"];
      if (actionKeys.includes(e.key)) {
        e.preventDefault();
        onKeyDownRef.current?.({ key: e.key, preventDefault: () => {} });
      } else if (e.key.length === 1 && /^[a-zA-Z]$/.test(e.key)) {
        e.preventDefault();
        onKeyDownRef.current?.({ key: e.key.toUpperCase(), preventDefault: () => {} });
      }
    }

    function onNativeInput() {
      const val = el!.value;
      el!.value = "";
      if (!val) return;
      const ch = val[val.length - 1]!.toUpperCase();
      if (/^[A-Z]$/.test(ch)) {
        onKeyDownRef.current?.({ key: ch, preventDefault: () => {} });
      }
    }

    el.addEventListener("keydown", onNativeKeydown);
    el.addEventListener("input",   onNativeInput);
    return () => {
      el.removeEventListener("keydown", onNativeKeydown);
      el.removeEventListener("input",   onNativeInput);
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
      {/* Hidden input — desktop only, ignored on touch devices */}
      <input
        ref={inputRef}
        className={styles.hiddenInput}
        type="text"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        tabIndex={-1}
        aria-hidden
        readOnly={false}
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
