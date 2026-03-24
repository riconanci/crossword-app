// app/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { ThemeToggle } from "@/components/ThemeToggle";
import styles from "./page.module.css";

const PLAYER_NAMES = ["Rico", "Alyssa"] as const;
const GAME_ACTIVE_KEY = "cw-game-active";

export default function HomePage() {
  const router = useRouter();
  const { playerName, setPlayerName, isReady } = usePlayerIdentity();

  const [pickingName, setPickingName] = useState(false);
  const [gameActive, setGameActive] = useState(false);

  useEffect(() => {
    if (isReady && !playerName) setPickingName(true);
    // Check if a game is currently in progress
    setGameActive(localStorage.getItem(GAME_ACTIVE_KEY) === "yes");
  }, [isReady, playerName]);

  function chooseName(name: string) {
    setPlayerName(name);
    setPickingName(false);
  }

  function handleJoin() {
    router.push("/game");
  }

  if (!isReady) return null;

  const btnLabel = gameActive ? "Rejoin game →" : "Join up →";

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

        {/* ── Name picker (first visit) ── */}
        {pickingName ? (
          <div className={styles.card}>
            <div className={styles.namePickerHeader}>
              <p className={styles.namePickerTitle}>Who are you?</p>
              <p className={styles.namePickerSub}>This device will always remember your choice.</p>
            </div>
            <div className={styles.namePickerBtns}>
              {PLAYER_NAMES.map((name) => (
                <button key={name} className={styles.namePickerBtn} onClick={() => chooseName(name)}>
                  <span className={styles.namePickerName}>{name}</span>
                  <span className={styles.namePickerArrow}>→</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
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

            {/* CTA */}
            <button className={styles.startBtn} onClick={handleJoin}>
              {btnLabel}
            </button>

            {gameActive && (
              <p className={styles.gameActiveNote}>A game is in progress — tap to rejoin</p>
            )}

          </div>
        )}
      </main>
    </div>
  );
}
