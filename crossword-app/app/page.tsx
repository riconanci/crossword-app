// app/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GameMode, BoardSize } from "@/lib/types";
import { BOARD_SIZES, DEFAULT_BOARD_SIZE } from "@/lib/constants";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { ThemeToggle } from "@/components/ThemeToggle";
import styles from "./page.module.css";

const MODES: { value: GameMode; label: string; description: string; icon: string }[] = [
  {
    value: "vs",
    label: "VS",
    description: "Race on separate boards",
    icon: "⚔️",
  },
  {
    value: "team",
    label: "Team",
    description: "Solve one board together",
    icon: "🤝",
  },
];

export default function HomePage() {
  const router = useRouter();
  const { playerId, playerName, setPlayerName, isReady } = usePlayerIdentity();

  const [mode, setMode] = useState<GameMode>("vs");
  const [size, setSize] = useState<BoardSize>(DEFAULT_BOARD_SIZE);
  const [nameInput, setNameInput] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  // Populate name input from identity once ready
  useEffect(() => {
    if (isReady) setNameInput(playerName || "");
  }, [isReady, playerName]);

  function handleStart() {
    const trimmed = nameInput.trim();
    if (trimmed) setPlayerName(trimmed);

    // Pass game config as query params — PartyKit room is permanent
    const params = new URLSearchParams({ mode, size: String(size) });
    router.push(`/game?${params}`);
  }

  if (!isReady) return null; // Prevent hydration flash

  return (
    <div className={styles.page}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoMark}>✦</span>
          <span className={styles.logoText}>Crossword</span>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.navBtn}
            onClick={() => router.push("/stats")}
          >
            Stats
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* ── Hero ── */}
      <main className={styles.main}>
        <section className={styles.hero}>
          <h1 className={styles.heroTitle}>
            Two players.<br />One puzzle.
          </h1>
          <p className={styles.heroSub}>
            Race your partner or solve together, in real time.
          </p>
        </section>

        {/* ── Config card ── */}
        <div className={styles.card}>

          {/* Player name */}
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="player-name">
              Your name
            </label>
            <input
              id="player-name"
              ref={nameRef}
              className={styles.input}
              type="text"
              placeholder="Player A"
              value={nameInput}
              maxLength={20}
              onChange={(e) => setNameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleStart()}
            />
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
                  <span className={styles.segmentIcon}>{m.icon}</span>
                  <span className={styles.segmentLabel}>{m.label}</span>
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
          <button
            className={styles.startBtn}
            onClick={handleStart}
            data-mode={mode}
          >
            Start game
            <span className={styles.startArrow}>→</span>
          </button>

          <p className={styles.roomNote}>
            Room: <span className={styles.mono}>me-and-gf</span> · No account needed
          </p>
        </div>
      </main>
    </div>
  );
}

function sizeDifficulty(s: BoardSize): string {
  if (s === 5) return "Quick";
  if (s === 7) return "Medium";
  return "Hard";
}
