// app/stats/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getStats } from "@/lib/stats";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { PlayerStats, BoardSize } from "@/lib/types";
import styles from "./page.module.css";

const SIZES: BoardSize[] = [5, 7, 11];

export default function StatsPage() {
  const router = useRouter();
  const { playerId, isReady } = usePlayerIdentity();
  const [stats, setStats] = useState<PlayerStats | null>(null);

  useEffect(() => {
    if (isReady) setStats(getStats(playerId));
  }, [isReady, playerId]);

  if (!isReady || !stats) return null;

  const winRate = stats.gamesPlayed > 0
    ? Math.round((stats.wins / stats.gamesPlayed) * 100)
    : 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push("/")}>← Home</button>
        <h1 className={styles.title}>Stats</h1>
        <ThemeToggle />
      </header>

      <main className={styles.main}>
        <div className={styles.content}>

          {/* ── Main numbers ── */}
          <div className={styles.bigRow}>
            <StatBox label="Played" value={stats.gamesPlayed} />
            <StatBox label="Won" value={stats.wins} />
            <StatBox label="Win %" value={`${winRate}%`} />
            <StatBox label="Streak" value={stats.currentStreak} />
          </div>

          {/* ── Streaks ── */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Streaks</h2>
            <div className={styles.row}>
              <div className={styles.rowLabel}>Current win streak</div>
              <div className={styles.rowValue}>{stats.currentStreak}</div>
            </div>
            <div className={styles.row}>
              <div className={styles.rowLabel}>Best win streak</div>
              <div className={styles.rowValue}>{stats.bestStreak}</div>
            </div>
          </div>

          {/* ── Best times per size ── */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Best Times</h2>
            {SIZES.map((size) => {
              const ms = stats.bestTimes[size];
              return (
                <div key={size} className={styles.row}>
                  <div className={styles.rowLabel}>{size}×{size}</div>
                  <div className={styles.rowValue}>
                    {ms != null ? fmtTime(ms) : <span className={styles.empty}>—</span>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── W / L breakdown ── */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Record</h2>
            <div className={styles.row}>
              <div className={styles.rowLabel}>Wins</div>
              <div className={`${styles.rowValue} ${styles.win}`}>{stats.wins}</div>
            </div>
            <div className={styles.row}>
              <div className={styles.rowLabel}>Losses</div>
              <div className={`${styles.rowValue} ${styles.loss}`}>{stats.losses}</div>
            </div>
          </div>

          {stats.gamesPlayed === 0 && (
            <p className={styles.empty} style={{ textAlign: "center", marginTop: "1rem" }}>
              Play a game to start tracking stats.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className={styles.statBox}>
      <div className={styles.statValue}>{value}</div>
      <div className={styles.statLabel}>{label}</div>
    </div>
  );
}

function fmtTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}
