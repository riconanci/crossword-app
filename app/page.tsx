// app/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GameMode, BoardSize } from "@/lib/types";
import { BOARD_SIZES, DEFAULT_BOARD_SIZE } from "@/lib/constants";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { ThemeToggle } from "@/components/ThemeToggle";
import styles from "./page.module.css";

const PLAYER_NAMES = ["Rico", "Alyssa"] as const;

const MODES: { value: GameMode; label: string; description: string; icon: string }[] = [
  { value: "vs",   label: "VS",   description: "Race on separate boards", icon: "⚔️" },
  { value: "team", label: "Team", description: "Solve one board together", icon: "🤝" },
];

export default function HomePage() {
  const router = useRouter();
  const { playerId, playerName, setPlayerName, isReady } = usePlayerIdentity();

  const [mode, setMode] = useState<GameMode>("vs");
  const [size, setSize] = useState<BoardSize>(DEFAULT_BOARD_SIZE);

  // Whether to show the name picker (first visit or user clicked "change")
  const [pickingName, setPickingName] = useState(false);

  useEffect(() => {
    if (isReady && !playerName) setPickingName(true);
  }, [isReady, playerName]);

  function chooseName(name: string) {
    setPlayerName(name);
    setPickingName(false);
  }

  function handleStart() {
    const params = new URLSearchParams({ mode, size: String(size) });
    router.push(`/game?${params}`);
  }

  if (!isReady) return null;

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoMark}>✦</span>
          <span className={styles.logoText}>Crossword</span>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.navBtn} onClick={() => router.push("/stats")}>Stats</button>
          <ThemeToggle />
        </div>
      </header>

      <main className={styles.main}>
        {/* ── Hero ── */}
        <section className={styles.hero}>
          <h1 className={styles.heroTitle}>Two players.<br />One puzzle.</h1>
          <p className={styles.heroSub}>Race your partner or solve together, in real time.</p>
        </section>

        {/* ── Name picker overlay (first visit) ── */}
        {pickingName ? (
          <div className={styles.card}>
            <div className={styles.namePickerHeader}>
              <p className={styles.namePickerTitle}>Who are you?</p>
              <p className={styles.namePickerSub}>This device will always remember your choice.</p>
            </div>
            <div className={styles.namePickerBtns}>
              {PLAYER_NAMES.map((name) => (
                <button
                  key={name}
                  className={styles.namePickerBtn}
                  onClick={() => chooseName(name)}
                >
                  <span className={styles.namePickerName}>{name}</span>
                  <span className={styles.namePickerArrow}>→</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* ── Config card (after name is set) ── */
          <div className={styles.card}>

            {/* Who you are */}
            <div className={styles.identityRow}>
              <div className={styles.identityLeft}>
                <p className={styles.identityName}>{playerName}</p>
                <p className={styles.identityLabel}>Playing as</p>
              </div>
              <button className={styles.changeBtn} onClick={() => setPickingName(true)}>
                Change
              </button>
            </div>

            {/* Mode */}
            <div className={styles.fieldGroup}>
              <span className={styles.label}>Mode</span>
              <div className={styles.segmentedControl} role="group">
                {MODES.map((m) => (
                  <button
                    key={m.value}
                    className={`${styles.segment} ${mode === m.value ? styles.segmentActive : ""}`}
                    onClick={() => setMode(m.value)}
                    aria-pressed={mode === m.value}
                    data-mode={m.value}
                  >
                    <span className={styles.segmentLabel}>{m.icon} {m.label}</span>
                    <span className={styles.segmentDesc}>{m.description}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Grid size */}
            <div className={styles.fieldGroup}>
              <span className={styles.label}>Grid size</span>
              <div className={styles.sizeRow}>
                {BOARD_SIZES.map((s) => (
                  <button
                    key={s}
                    className={`${styles.sizeBtn} ${size === s ? styles.sizeBtnActive : ""}`}
                    onClick={() => setSize(s)}
                    aria-pressed={size === s}
                  >
                    <span className={styles.sizeDim}>{s}×{s}</span>
                    <span className={styles.sizeDifficulty}>{sizeDifficulty(s)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* CTA */}
            <button className={styles.startBtn} onClick={handleStart} data-mode={mode}>
              Start game
              <span className={styles.startArrow}>→</span>
            </button>


          </div>
        )}
      </main>
    </div>
  );
}

function sizeDifficulty(s: BoardSize): string {
  if (s === 5) return "Quick";
  if (s === 7) return "Medium";
  return "Hard";
}
