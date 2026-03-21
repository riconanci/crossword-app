// app/stats/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getPairStats, clearAllStats } from "@/lib/stats";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { PlayerRecord, ModeStats, SizeStats } from "@/lib/types";
import type { BoardSize } from "@/lib/types";
import { getSoundsEnabled, setSoundsEnabled } from "@/lib/sounds";
import { getHapticsEnabled, setHapticsEnabled } from "@/lib/haptics";
import styles from "./page.module.css";

type Tab = "vs" | "team" | "settings";
const SIZES: BoardSize[] = [5, 7, 11];

export default function StatsPage() {
  const router = useRouter();
  const { playerId, isReady } = usePlayerIdentity();
  const [tab, setTab] = useState<Tab>("vs");
  const [me, setMe]   = useState<PlayerRecord | null>(null);
  const [opp, setOpp] = useState<PlayerRecord | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (!isReady) return;
    const pair = getPairStats();
    const all  = Object.values(pair);
    const myRecord  = pair[playerId] ?? null;
    const oppRecord = all.find((r) => r.playerId !== playerId) ?? null;
    setMe(myRecord);
    setOpp(oppRecord);
  }, [isReady, playerId]);

  if (!isReady) return null;

  const noData = !me && !opp;

  function handleReset() {
    clearAllStats();
    setMe(null);
    setOpp(null);
    setConfirmReset(false);
    setTab("vs");
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push("/")}>← Home</button>
        <h1 className={styles.title}>Stats</h1>
        <div className={styles.headerRight}>
          {!noData && (
            <button className={styles.resetBtn} onClick={() => setConfirmReset(true)}>Reset</button>
          )}
          <ThemeToggle />
        </div>
      </header>

      {/* ── Mode tabs ── */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === "vs" ? styles.tabActive : ""}`}
          onClick={() => setTab("vs")}
        >
          ⚔️ VS
        </button>
        <button
          className={`${styles.tab} ${tab === "team" ? styles.tabActive : ""}`}
          onClick={() => setTab("team")}
        >
          🤝 Team
        </button>
        <button
          className={`${styles.tab} ${tab === "settings" ? styles.tabActive : ""}`}
          onClick={() => setTab("settings")}
        >
          ⚙️ Settings
        </button>
      </div>

      <main className={styles.main}>
        {noData ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>📊</span>
            <p>No games played yet.<br />Stats will appear here after your first game.</p>
          </div>
        ) : tab === "vs" ? (
          <VSTab me={me} opp={opp} />
        ) : tab === "team" ? (
          <TeamTab me={me} opp={opp} />
        ) : (
          <SettingsTab />
        )}
      </main>
      {/* ── Reset confirmation dialog ── */}
      {confirmReset && (
        <div className={styles.resetOverlay}>
          <div className={styles.resetDialog}>
            <h3 className={styles.resetDialogTitle}>Reset all stats?</h3>
            <p className={styles.resetDialogBody}>
              This will permanently delete all wins, losses, forfeits, and best times for both players. This cannot be undone.
            </p>
            <div className={styles.resetDialogActions}>
              <button className={styles.resetCancel} onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button className={styles.resetConfirm} onClick={handleReset}>
                Reset everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── VS Tab ───────────────────────────────────────────────────────────────────

function VSTab({ me, opp }: { me: PlayerRecord | null; opp: PlayerRecord | null }) {
  const meVS  = me?.vs;
  const oppVS = opp?.vs;

  // Head-to-head win percent for the bar (me vs opp)
  const totalGames = (meVS?.played ?? 0);
  const myWins     = meVS?.won ?? 0;
  const oppWins    = oppVS?.won ?? 0;
  const totalWins  = myWins + oppWins;
  // Bar position: what fraction of wins belong to me (0–1), default 0.5
  const barPct = totalWins > 0 ? myWins / totalWins : 0.5;

  const myForfeits  = meVS?.forfeits  ?? 0;
  const oppForfeits = oppVS?.forfeits ?? 0;

  const myName  = me?.playerName  || "You";
  const oppName = opp?.playerName || "Partner";

  return (
    <div className={styles.content}>

      {/* ── Head-to-head bar ── */}
      <div className={styles.h2hSection}>
        <div className={styles.h2hLabels}>
          <span className={styles.h2hName} data-side="left">{myName}</span>
          <span className={styles.h2hRecord}>
            {myWins} – {oppWins}
          </span>
          <span className={styles.h2hName} data-side="right">{oppName}</span>
        </div>
        <div className={styles.h2hBarTrack}>
          {/* The fill slides left (my wins) vs right (opp wins) from center */}
          <div
            className={styles.h2hBarFill}
            style={{ "--h2h-pct": barPct } as React.CSSProperties}
          />
          <div className={styles.h2hBarCenter} />
        </div>
        <div className={styles.h2hSub}>
          {totalWins === 0
            ? "No VS games yet"
            : `${Math.round(barPct * 100)}% — ${myName}`}
        </div>
        {(myForfeits > 0 || oppForfeits > 0) && (
          <div className={styles.h2hForfeits}>
            <span>🏳️ Forfeits: {myName} {myForfeits} — {oppForfeits} {oppName}</span>
          </div>
        )}
      </div>

      {/* ── Best times ── */}
      {(me?.bestTimes || opp?.bestTimes) && (
        <BestTimesCard me={me} opp={opp} myName={myName} oppName={oppName} />
      )}

      {/* ── Per-size breakdown ── */}
      {SIZES.map((size) => (
        <SizeCard
          key={size}
          size={size}
          myStats={meVS?.bySize[size]}
          oppStats={oppVS?.bySize[size]}
          myName={myName}
          oppName={oppName}
          mode="vs"
        />
      ))}
    </div>
  );
}

// ─── Team Tab ─────────────────────────────────────────────────────────────────

function TeamTab({ me, opp }: { me: PlayerRecord | null; opp: PlayerRecord | null }) {
  const meT  = me?.team;
  const oppT = opp?.team;

  // Use either player's record (they should match since both win/lose together)
  const played   = meT?.played   ?? oppT?.played   ?? 0;
  const won      = meT?.won      ?? oppT?.won      ?? 0;
  const forfeits = meT?.forfeits ?? oppT?.forfeits ?? 0;
  const winPct = played > 0 ? won / played : 0;

  const myName  = me?.playerName  || "You";
  const oppName = opp?.playerName || "Partner";

  return (
    <div className={styles.content}>

      {/* ── Coop win bar ── */}
      <div className={styles.h2hSection}>
        <div className={styles.coopSummary}>
          <span className={styles.coopWon}>{won}</span>
          <span className={styles.coopLabel}>puzzles solved together</span>
        </div>
        <div className={styles.coopBarTrack}>
          <div
            className={styles.coopBarFill}
            style={{ width: `${Math.round(winPct * 100)}%` }}
          />
        </div>
        <div className={styles.h2hSub}>
          {played === 0
            ? "No Team games yet"
            : `${won} won · ${played - won - forfeits} lost · ${forfeits} forfeited · ${Math.round(winPct * 100)}% win rate`}
        </div>
      </div>

      {/* ── Per-size breakdown ── */}
      {SIZES.map((size) => (
        <SizeCard
          key={size}
          size={size}
          myStats={meT?.bySize[size]}
          oppStats={oppT?.bySize[size]}
          myName={myName}
          oppName={oppName}
          mode="team"
        />
      ))}
    </div>
  );
}

// ─── Size Card ────────────────────────────────────────────────────────────────

function SizeCard({
  size, myStats, oppStats, myName, oppName, mode,
}: {
  size: BoardSize;
  myStats?: SizeStats;
  oppStats?: SizeStats;
  myName: string;
  oppName: string;
  mode: Tab;
}) {
  if (!myStats && !oppStats) return null;

  const sizeDiff = size === 5 ? "Quick" : size === 7 ? "Medium" : "Hard";

  if (mode === "team") {
    const played = myStats?.played ?? oppStats?.played ?? 0;
    const won    = myStats?.won    ?? oppStats?.won    ?? 0;
    const pct    = played > 0 ? Math.round((won / played) * 100) : 0;
    return (
      <div className={styles.sizeCard}>
        <div className={styles.sizeCardHeader}>
          <span className={styles.sizeLabel}>{size}×{size}</span>
          <span className={styles.sizeDiff}>{sizeDiff}</span>
        </div>
        <div className={styles.sizeRow}>
          <span className={styles.sizeKey}>Played</span>
          <span className={styles.sizeVal}>{played}</span>
        </div>
        <div className={styles.sizeRow}>
          <span className={styles.sizeKey}>Won</span>
          <span className={`${styles.sizeVal} ${styles.win}`}>{won}</span>
        </div>
        <div className={styles.sizeRow}>
          <span className={styles.sizeKey}>Win %</span>
          <span className={styles.sizeVal}>{pct}%</span>
        </div>
        {((myStats?.forfeits ?? 0) > 0) && (
          <div className={styles.sizeRow}>
            <span className={styles.sizeKey}>Forfeits</span>
            <span className={`${styles.sizeVal} ${styles.forfeit}`}>{myStats?.forfeits ?? 0}</span>
          </div>
        )}
      </div>
    );
  }

  // VS mode — show both players side by side
  const myPlayed  = myStats?.played  ?? 0;
  const myWon     = myStats?.won     ?? 0;
  const oppPlayed = oppStats?.played ?? 0;
  const oppWon    = oppStats?.won    ?? 0;
  const myPct     = myPlayed  > 0 ? Math.round((myWon  / myPlayed)  * 100) : 0;
  const oppPct    = oppPlayed > 0 ? Math.round((oppWon / oppPlayed) * 100) : 0;

  return (
    <div className={styles.sizeCard}>
      <div className={styles.sizeCardHeader}>
        <span className={styles.sizeLabel}>{size}×{size}</span>
        <span className={styles.sizeDiff}>{sizeDiff}</span>
      </div>
      <div className={styles.vsGrid}>
        <span className={styles.vsPlayerName}>{myName}</span>
        <span className={styles.vsPlayerName} style={{ textAlign: "right" }}>{oppName}</span>

        <StatPair label="Played"   left={myPlayed}  right={oppPlayed} />
        <StatPair label="Won"      left={myWon}     right={oppWon}    highlight />
        <StatPair label="Win %"    left={`${myPct}%`} right={`${oppPct}%`} />
        {((myStats?.forfeits ?? 0) > 0 || (oppStats?.forfeits ?? 0) > 0) && (
          <StatPair label="Forfeits" left={myStats?.forfeits ?? 0} right={oppStats?.forfeits ?? 0} dimmed />
        )}
      </div>
    </div>
  );
}

function BestTimesCard({ me, opp, myName, oppName }: {
  me: PlayerRecord | null; opp: PlayerRecord | null;
  myName: string; oppName: string;
}) {
  const sizes: BoardSize[] = [5, 7, 11];
  const hasAny = sizes.some(s => me?.bestTimes?.[s] || opp?.bestTimes?.[s]);
  if (!hasAny) return null;
  return (
    <div className={styles.sizeCard}>
      <div className={styles.sizeCardHeader}>
        <span className={styles.sizeLabel}>🏅 Best Times</span>
      </div>
      <div className={styles.vsGrid}>
        <span className={styles.vsPlayerName}>{myName}</span>
        <span />
        <span className={styles.vsPlayerName} style={{ textAlign: "right" }}>{oppName}</span>
        {sizes.map((s) => {
          const myT  = me?.bestTimes?.[s];
          const oppT = opp?.bestTimes?.[s];
          if (!myT && !oppT) return null;
          return (
            <StatPair
              key={s}
              label={`${s}×${s}`}
              left={myT  ? fmtTime(myT)  : "—"}
              right={oppT ? fmtTime(oppT) : "—"}
              highlight={!!myT && !!oppT && myT < oppT}
            />
          );
        })}
      </div>
    </div>
  );
}

function SettingsTab() {
  const [sounds,  setSounds]  = useState(getSoundsEnabled);
  const [haptics, setHaptics] = useState(getHapticsEnabled);
  return (
    <div className={styles.content}>
      <div className={styles.sizeCard}>
        <div className={styles.sizeCardHeader}>
          <span className={styles.sizeLabel}>Sound Effects</span>
        </div>
        <div className={styles.settingRow}>
          <div>
            <p className={styles.settingLabel}>Sounds</p>
            <p className={styles.settingDesc}>Keypress clicks, win fanfare, wrong buzz</p>
          </div>
          <button
            className={`${styles.toggle} ${sounds ? styles.toggleOn : ""}`}
            onClick={() => { const n = !sounds; setSounds(n); setSoundsEnabled(n); }}
            aria-label={sounds ? "Disable sounds" : "Enable sounds"}
          >
            <span className={styles.toggleThumb} />
          </button>
        </div>
        <div className={styles.settingRow}>
          <div>
            <p className={styles.settingLabel}>Haptics</p>
            <p className={styles.settingDesc}>Vibration feedback on mobile</p>
          </div>
          <button
            className={`${styles.toggle} ${haptics ? styles.toggleOn : ""}`}
            onClick={() => { const n = !haptics; setHaptics(n); setHapticsEnabled(n); }}
            aria-label={haptics ? "Disable haptics" : "Enable haptics"}
          >
            <span className={styles.toggleThumb} />
          </button>
        </div>
      </div>
    </div>
  );
}


function fmtTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

function StatPair({
  label, left, right, highlight, dimmed,
}: {
  label: string;
  left: number | string;
  right: number | string;
  highlight?: boolean;
  dimmed?: boolean;
}) {
  const cls = highlight ? styles.win : dimmed ? styles.forfeit : "";
  return (
    <>
      <span className={`${styles.statVal} ${cls}`}>{left}</span>
      <span className={styles.statKeyCenter}>{label}</span>
      <span className={`${styles.statVal} ${styles.statValRight} ${cls}`}>{right}</span>
    </>
  );
}
