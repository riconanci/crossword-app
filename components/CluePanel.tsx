// components/CluePanel.tsx

"use client";

import { useEffect, useRef, useState } from "react";
import type { Clue, Direction } from "@/lib/types";
import styles from "./CluePanel.module.css";

interface Props {
  clues: Clue[];
  entries: Record<number, string>;
  activeClue: Clue | null;
  onClueSelect?: (clue: Clue) => void;
  onPrev?: () => void;
  onNext?: () => void;
}

export function CluePanel({ clues, entries, activeClue, onClueSelect, onPrev, onNext }: Props) {
  const [tab, setTab] = useState<Direction>("across");
  const activeRef = useRef<HTMLButtonElement | null>(null);

  const across  = clues.filter((c) => c.direction === "across");
  const down    = clues.filter((c) => c.direction === "down");
  const visible = tab === "across" ? across : down;

  // Auto-switch tab when active clue changes direction
  useEffect(() => {
    if (activeClue) setTab(activeClue.direction);
  }, [activeClue?.direction, activeClue?.number]);

  // Scroll active clue into view
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeClue?.number, activeClue?.direction]);

  /** True if every cell in clue is filled */
  function complete(clue: Clue) {
    return clue.cells.every((ci) => !!entries[ci]);
  }

  if (clues.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.placeholder}>Clues will appear once a game starts.</div>
      </div>
    );
  }

  return (
    <div className={styles.panel}>

      {/* ── Active clue banner with prev / next ── */}
      <div className={styles.activeBanner}>
        <button
          className={styles.navBtn}
          onClick={onPrev}
          aria-label="Previous clue"
          title="Previous incomplete clue"
        >
          ‹
        </button>

        <div className={styles.bannerBody}>
          {activeClue ? (
            <>
              <span className={styles.bannerLabel}>
                {activeClue.number}
                <span className={styles.bannerDir}>
                  {activeClue.direction === "across" ? "A" : "D"}
                </span>
              </span>
              <span className={styles.bannerText}>{activeClue.text}</span>
            </>
          ) : (
            <span className={styles.bannerText}>Select a cell to begin</span>
          )}
        </div>

        <button
          className={styles.navBtn}
          onClick={onNext}
          aria-label="Next clue"
          title="Next incomplete clue"
        >
          ›
        </button>
      </div>

      {/* ── Across / Down tabs ── */}
      <div className={styles.tabs} role="tablist">
        {(["across", "down"] as Direction[]).map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={tab === d}
            className={`${styles.tab} ${tab === d ? styles.tabActive : ""}`}
            onClick={() => setTab(d)}
          >
            {d === "across" ? "Across" : "Down"}
            <span className={styles.tabCount}>
              {d === "across" ? across.length : down.length}
            </span>
          </button>
        ))}
      </div>

      {/* ── Clue list ── */}
      <ol className={styles.list} role="tabpanel">
        {visible.map((clue) => {
          const isActive = activeClue?.number === clue.number && activeClue?.direction === clue.direction;
          const isDone   = complete(clue);
          return (
            <li key={`${clue.direction}-${clue.number}`}>
              <button
                ref={isActive ? activeRef : null}
                className={[
                  styles.clueItem,
                  isActive ? styles.clueActive : "",
                  isDone   ? styles.clueDone   : "",
                ].join(" ")}
                onClick={() => onClueSelect?.(clue)}
              >
                <span className={styles.clueNum}>{clue.number}</span>
                <span className={styles.clueText}>{clue.text}</span>
                {isDone && <span className={styles.checkMark} aria-label="complete">✓</span>}
              </button>
            </li>
          );
        })}
      </ol>

    </div>
  );
}
