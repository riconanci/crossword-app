// components/CrosswordGrid.tsx — Full NYT-style interactive crossword grid

"use client";

import type { Puzzle, Direction } from "@/lib/types";
import styles from "./CrosswordGrid.module.css";

interface Props {
  puzzle: Puzzle;
  entries: Record<number, string>;
  wrongCells?: number[];
  /** Cells verified correct by the checker — shown green and locked from editing */
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

  return (
    <div
      ref={gridRef as React.RefObject<HTMLDivElement>}
      className={styles.grid}
      style={{ "--grid-size": size } as React.CSSProperties}
      tabIndex={0}
      onKeyDown={onKeyDown ?? (() => {})}
      aria-label={`${size}×${size} crossword grid`}
      role="grid"
    >
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
            {isCorrect && !cell.startNumber && (
              <span className={styles.lockDot} aria-hidden />
            )}
            <span className={styles.cellLetter}>{letter}</span>
          </div>
        );
      })}
    </div>
  );
}
