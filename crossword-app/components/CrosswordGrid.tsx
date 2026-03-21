// components/CrosswordGrid.tsx — Full NYT-style interactive crossword grid

"use client";

import type { Puzzle, Direction } from "@/lib/types";
import styles from "./CrosswordGrid.module.css";

interface Props {
  puzzle: Puzzle;
  entries: Record<number, string>;
  wrongCells?: number[];
  partnerCells?: number[];
  /** Currently selected cell index */
  selectedCell: number | null;
  /** Currently selected direction */
  direction: Direction;
  /** All cell indices of the active word */
  activeWordCells: number[];
  onCellClick: (cellIndex: number) => void;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  gridRef: React.RefObject<HTMLDivElement | null>;
}

export function CrosswordGrid({
  puzzle,
  entries,
  wrongCells = [],
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

        const isSelected = cell.index === selectedCell;
        const isInWord = activeWordCells.includes(cell.index);
        const isWrong = wrongCells.includes(cell.index);
        const isPartner = partnerCells.includes(cell.index);
        const letter = entries[cell.index] ?? "";

        let cellClass = styles.cell;
        if (isSelected)      cellClass += ` ${styles.cellSelected}`;
        else if (isPartner)  cellClass += ` ${styles.cellPartner}`;
        else if (isInWord)   cellClass += ` ${styles.cellInWord}`;
        if (isWrong)         cellClass += ` ${styles.cellWrong}`;

        return (
          <div
            key={cell.index}
            className={cellClass}
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
