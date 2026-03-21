// app/game/page.tsx
"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { GameMode, BoardSize, Clue } from "@/lib/types";
import { useGameSocket } from "@/hooks/useGameSocket";
import { usePlayerIdentity } from "@/hooks/usePlayerIdentity";
import { useGridInput } from "@/hooks/useGridInput";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { CrosswordGrid } from "@/components/CrosswordGrid";
import { CluePanel } from "@/components/CluePanel";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DEFAULT_BOARD_SIZE } from "@/lib/constants";
import styles from "./page.module.css";
import { recordWin, recordLoss } from "@/lib/stats";

export default function GamePageWrapper() {
  return (
    <Suspense>
      <GamePage />
    </Suspense>
  );
}

function GamePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { playerId, playerName, isReady } = usePlayerIdentity();

  const mode = (searchParams.get("mode") ?? "vs") as GameMode;
  const size = Number(searchParams.get("size") ?? DEFAULT_BOARD_SIZE) as BoardSize;

  const {
    connectionState,
    roomState,
    opponentProgress,
    joinRoom,
    startGame,
    sendCellInput,
    sendPresence,
    requestCheck,
    requestRestart,
    requestGiveUp,
  } = useGameSocket(playerId);

  // Join once connected
  const hasJoined = useRef(false);
  useEffect(() => {
    if ((connectionState === "connected" || connectionState === "demo") && isReady && !hasJoined.current) {
      hasJoined.current = true;
      joinRoom(playerName || "Player");
    }
  }, [connectionState, isReady, joinRoom, playerName]);

  // Elapsed timer
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (roomState?.phase !== "playing" || !roomState.startedAt) return;
    const t = roomState.startedAt;
    const interval = setInterval(() => setElapsed(Math.floor((Date.now() - t) / 1000)), 1000);
    return () => clearInterval(interval);
  }, [roomState?.phase, roomState?.startedAt]);

  const phase   = roomState?.phase ?? "lobby";
  const puzzle  = roomState?.puzzle ?? null;
  const myVs    = roomState?.vsState?.[playerId];
  const team    = roomState?.teamState;

  const entries    = mode === "vs" ? myVs?.entries ?? {} : team?.entries ?? {};
  const wrongCells = mode === "vs" ? myVs?.incorrectCells ?? [] : team?.incorrectCells ?? [];
  const checksLeft = mode === "vs" ? myVs?.checksRemaining ?? 0 : team?.checksRemaining ?? 0;

  const partnerCells =
    mode === "team"
      ? Object.values(team?.presence ?? {})
          .filter((p) => p.playerId !== playerId)
          .flatMap((p) => p.focusedWordCells)
      : [];

  // Grid input — pass null when not actively playing to disable all input
  const activePuzzle = phase === "playing" ? puzzle : null;
  const grid = useGridInput(
    activePuzzle,
    entries,
    sendCellInput,
    mode === "team" ? sendPresence : undefined
  );

  const [confirmingGiveUp, setConfirmingGiveUp] = useState(false);

  // Record stats exactly once when game transitions to finished
  const prevPhaseRef = useRef<string>('lobby');
  useEffect(() => {
    if (roomState?.phase === 'finished' && prevPhaseRef.current === 'playing') {
      const timeMs = roomState.finishedAt && roomState.startedAt
        ? roomState.finishedAt - roomState.startedAt
        : elapsed * 1000;
      const isTeam   = roomState.mode === 'team';
      const gaveUp   = roomState.gaveUp;
      const iWon     = roomState.winnerId === playerId;
      const someoneWon = roomState.winnerId !== null;

      if (gaveUp) {
        if (iWon) {
          // Opponent gave up in VS — I win
          recordWin(playerId, size, timeMs);
        } else {
          // I gave up (VS or Team)
          recordLoss(playerId);
        }
      } else if (isTeam) {
        // Team solved it together — both win (winnerId is null for team wins)
        recordWin(playerId, size, timeMs);
      } else if (iWon) {
        recordWin(playerId, size, timeMs);
      } else if (someoneWon) {
        recordLoss(playerId);
      }
    }
    prevPhaseRef.current = roomState?.phase ?? 'lobby';
  }, [roomState?.phase, roomState?.winnerId, roomState?.gaveUp]);

  // Jump to clue from clue panel click
  function handleClueSelect(clue: Clue) {
    grid.selectClue(clue);
  }

  const opponentPlayer = roomState?.players.find((p) => p.id !== playerId);

  if (!isReady) return null;

  return (
    <div className={styles.page}>
      {/* ── Topbar ── */}
      <header className={styles.topbar}>
        <button className={styles.backBtn} onClick={() => router.push("/")}>← Home</button>

        <div className={styles.topbarCenter}>
          <span className={styles.modeBadge} data-mode={mode}>
            {mode === "vs" ? "⚔️ VS" : "🤝 Team"}
          </span>
          <span className={styles.sizeBadge}>{size}×{size}</span>
        </div>

        <div className={styles.topbarRight}>
          {phase === "playing" && <span className={styles.timer}>{fmt(elapsed)}</span>}
          <ConnectionStatus state={connectionState} />
          <ThemeToggle />
        </div>
      </header>

      <div className={styles.body}>
        {/* ── Lobby ── */}
        {phase === "lobby" && (
          <LobbyPanel
            mode={mode} size={size}
            players={roomState?.players ?? []}
            playerId={playerId}
            onStart={() => startGame(mode, size)}
          />
        )}

        {/* ── Playing ── */}
        {phase === "playing" && puzzle && (
          <>
            <div className={styles.gameLayout}>
              <div className={styles.gridArea}>

                {/* Opponent bar (VS) */}
                {mode === "vs" && opponentPlayer && (
                  <div className={styles.opponentBar}>
                    <span className={styles.opponentName}>
                      {opponentPlayer.name}
                      {opponentProgress?.isActive && <span className={styles.activeDot} />}
                    </span>
                    <div className={styles.track}>
                      <div className={styles.fill} style={{ width: `${opponentProgress?.progress ?? 0}%` }} />
                    </div>
                    <span className={styles.pct}>{opponentProgress?.progress ?? 0}%</span>
                  </div>
                )}

                {/* Partner label (Team) */}
                {mode === "team" && (
                  <PartnerLabel presence={team?.presence ?? {}} myId={playerId} />
                )}

                {/* ── THE GRID ── */}
                <CrosswordGrid
                  puzzle={puzzle}
                  entries={entries}
                  wrongCells={wrongCells}
                  partnerCells={partnerCells}
                  selectedCell={grid.selection.cellIndex}
                  direction={grid.selection.direction}
                  activeWordCells={grid.activeWordCells}
                  onCellClick={grid.selectCell}
                  onKeyDown={(e) => {
                    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","Tab"].includes(e.key)) {
                      e.preventDefault();
                    }
                    grid.handleKey(e.key);
                  }}
                  gridRef={grid.gridRef}
                />

                {/* Wrong-answer nudge */}
                {mode === "vs" && myVs?.isFinished && myVs.isCorrect === false && (
                  <div className={styles.nudge}>{"Something's wrong — keep going! ✏️"}</div>
                )}
                {mode === "team" && team?.isComplete && team.isCorrect === false && (
                  <div className={styles.nudge}>{"Something's wrong — keep going! ✏️"}</div>
                )}

                {/* Action row */}
                <div className={styles.actionRow}>
                  <button
                    className={styles.checkBtn}
                    onClick={requestCheck}
                    disabled={checksLeft === 0}
                    title={checksLeft === 0 ? "No checks remaining" : `Check (${checksLeft} left)`}
                  >
                    Check {checksLeft > 0 && <span className={styles.checkCount}>{checksLeft}</span>}
                  </button>

                  <button
                    className={styles.giveUpBtn}
                    onClick={() => setConfirmingGiveUp(true)}
                  >
                    Give Up
                  </button>

                  {/* My progress */}
                  {mode === "vs" && myVs && (
                    <div className={styles.myProgress}>
                      <div className={styles.track}>
                        <div className={`${styles.fill} ${styles.myFill}`} style={{ width: `${myVs.progress}%` }} />
                      </div>
                      <span className={styles.pct}>{myVs.progress}%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Clue panel ── */}
              <aside className={styles.clueArea}>
                <CluePanel
                  clues={puzzle.clues}
                  entries={entries}
                  activeClue={grid.activeClue}
                  onClueSelect={handleClueSelect}
                  onPrev={grid.goPrevClue}
                  onNext={grid.goNextClue}
                />
              </aside>
            </div>

            {/* ── Give Up Confirm Dialog ── */}
            {confirmingGiveUp && (
              <div className={styles.overlay}>
                <div className={styles.dialog}>
                  <h3 className={styles.dialogTitle}>Give up?</h3>
                  <p className={styles.dialogBody}>
                    {mode === "team"
                      ? "The puzzle will be solved and both players will get a loss."
                      : "The puzzle will be solved and you’ll take a loss."}
                  </p>
                  <div className={styles.dialogActions}>
                    <button className={styles.dialogCancel} onClick={() => setConfirmingGiveUp(false)}>
                      Keep going
                    </button>
                    <button
                      className={styles.dialogConfirm}
                      onClick={() => { setConfirmingGiveUp(false); requestGiveUp(); }}
                    >
                      Give up
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Finished: normal win ── */}
        {phase === "finished" && !roomState?.gaveUp && (
          <FinishedPanel
            roomState={roomState!}
            playerId={playerId}
            elapsed={elapsed}
            onRestart={requestRestart}
          />
        )}

        {/* ── Finished: gave up — show solved board + result banner ── */}
        {phase === "finished" && roomState?.gaveUp && puzzle && (
          <div className={styles.gameLayout}>
            <div className={styles.gridArea}>

              {/* Result banner */}
              <GaveUpBanner
                roomState={roomState!}
                playerId={playerId}
                onRestart={requestRestart}
              />

              {/* Solved grid — read-only, answers filled in */}
              <CrosswordGrid
                puzzle={puzzle}
                entries={entries}
                wrongCells={[]}
                partnerCells={[]}
                selectedCell={null}
                direction="across"
                activeWordCells={[]}
                onCellClick={() => {}}
                gridRef={grid.gridRef}
              />
            </div>

            {/* Clue panel — still navigable for reading */}
            <aside className={styles.clueArea}>
              <CluePanel
                clues={puzzle.clues}
                entries={entries}
                activeClue={null}
                onPrev={undefined}
                onNext={undefined}
              />
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LobbyPanel({
  mode, size, players, playerId, onStart,
}: {
  mode: GameMode; size: BoardSize;
  players: { id: string; name: string; isOnline: boolean }[];
  playerId: string; onStart: () => void;
}) {
  const online = players.filter((p) => p.isOnline);
  return (
    <div className={styles.lobby}>
      <div className={styles.lobbyCard}>
        <h2 className={styles.lobbyTitle}>Waiting room</h2>
        <p className={styles.lobbySub}>
          {mode === "vs" ? "Race to finish your own board first" : "Solve one shared board together"}
          {" · "}{size}×{size}
        </p>
        <div className={styles.playerList}>
          {online.map((p) => (
            <div key={p.id} className={styles.playerRow}>
              <span className={styles.playerDot} />
              <span className={styles.playerRowName}>
                {p.name}
                {p.id === playerId && <span className={styles.youBadge}>you</span>}
              </span>
            </div>
          ))}
          {online.length < 2 && (
            <div className={styles.playerRow}>
              <span className={`${styles.playerDot} ${styles.dotWaiting}`} />
              <span className={styles.playerRowName} style={{ opacity: 0.4 }}>Waiting for partner…</span>
            </div>
          )}
        </div>
        <button className={styles.startGameBtn} onClick={onStart}>Start game <span>→</span></button>
        <p className={styles.lobbyNote}>Both players can press Start — first one triggers the game.</p>
      </div>
    </div>
  );
}

function PartnerLabel({
  presence, myId,
}: {
  presence: Record<string, { playerId: string; activeClueLabel: string }>;
  myId: string;
}) {
  const partner = Object.values(presence).find((p) => p.playerId !== myId);
  if (!partner?.activeClueLabel) return null;
  return (
    <div className={styles.partnerPresence}>
      <span className={styles.partnerDot} />
      Partner: {partner.activeClueLabel}
    </div>
  );
}

function GaveUpBanner({
  roomState, playerId, onRestart,
}: {
  roomState: NonNullable<ReturnType<typeof useGameSocket>["roomState"]>;
  playerId: string;
  onRestart: () => void;
}) {
  const isTeam  = roomState.mode === "team";
  const iWon    = roomState.winnerId === playerId;

  const emoji = iWon ? "🏆" : "🏳️";
  const title = isTeam
    ? "You gave up — here’s the solution"
    : iWon
    ? "Opponent gave up — you win!"
    : "You gave up — here’s the solution";

  return (
    <div className={styles.gaveUpBanner}>
      <span className={styles.gaveUpEmoji}>{emoji}</span>
      <span className={styles.gaveUpTitle}>{title}</span>
      <button className={styles.restartBtnSm} onClick={onRestart}>Play again</button>
    </div>
  );
}

function FinishedPanel({
  roomState, playerId, elapsed, onRestart,
}: {
  roomState: NonNullable<ReturnType<typeof useGameSocket>["roomState"]>;
  playerId: string; elapsed: number; onRestart: () => void;
}) {
  const isTeam   = roomState.mode === "team";
  const gaveUp   = roomState.gaveUp;
  const isWinner = roomState.winnerId === playerId;
  const winner   = roomState.players.find((p) => p.id === roomState.winnerId);

  let emoji = "🎉";
  let title = "Puzzle solved!";
  let subtitle = `Finished in ${fmt(elapsed)}`;

  if (gaveUp) {
    emoji = "🏳️";
    title = isTeam ? "You gave up" : isWinner ? "Opponent gave up — you win!" : "You gave up";
    subtitle = "Better luck next time";
  } else if (!isTeam) {
    emoji = isWinner ? "🏆" : "💪";
    title = isWinner ? "You win!" : `${winner?.name ?? "Opponent"} wins`;
    subtitle = `Finished in ${fmt(elapsed)}`;
  }

  return (
    <div className={styles.finished}>
      <div className={styles.finishedCard}>
        <div className={styles.finishedEmoji}>{emoji}</div>
        <h2 className={styles.finishedTitle}>{title}</h2>
        <p className={styles.finishedTime}>{subtitle}</p>
        <button className={styles.restartBtn} onClick={onRestart}>Play again</button>
      </div>
    </div>
  );
}

function fmt(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}
