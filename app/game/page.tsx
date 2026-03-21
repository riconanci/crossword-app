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
import { DEFAULT_BOARD_SIZE, BOARD_SIZES } from "@/lib/constants";
import styles from "./page.module.css";
import { recordGameResult } from "@/lib/stats";
import { soundWin, soundLoss } from "@/lib/sounds";
import { hapticWin } from "@/lib/haptics";
import { Confetti } from "@/components/Confetti";

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
    requestEndGame,
    checkedEntries,
    gameEndedBy,
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

  // Must be declared before allWrongCells/wrongCells which reference them
  const [dismissedWrongCells, setDismissedWrongCells] = useState<number[]>([]);

  const entries    = mode === "vs" ? myVs?.entries ?? {} : team?.entries ?? {};
  const allWrongCells = mode === "vs" ? myVs?.incorrectCells ?? [] : team?.incorrectCells ?? [];
  // Filter out cells the player has clicked to dismiss the red mark
  const wrongCells = allWrongCells.filter((ci) => !dismissedWrongCells.includes(ci));

  // correctCells: cells confirmed correct by the checker.
  // Only light up AFTER a check has been explicitly run:
  //   VS mode  → checksRemaining dropped below the starting value (2)
  //   Team mode → same
  // We do NOT mark cells correct just because the grid is full — only after a real check.
  const startingChecks = 2; // CHECKS_PER_GAME constant
  const checksUsed = mode === "vs"
    ? startingChecks - (myVs?.checksRemaining ?? startingChecks)
    : startingChecks - (team?.checksRemaining ?? startingChecks);
  const checksRun = checksUsed > 0;
  const correctCells = checksRun
    ? Object.keys(entries)
        .map(Number)
        .filter((ci) => entries[ci] && !wrongCells.includes(ci))
    : [];
  const checksLeft = mode === "vs" ? myVs?.checksRemaining ?? 0 : team?.checksRemaining ?? 0;

  const partnerCells =
    mode === "team"
      ? Object.values(team?.presence ?? {})
          .filter((p) => p.playerId !== playerId)
          .flatMap((p) => p.focusedWordCells)
      : [];

  // Grid input — pass null when not actively playing to disable all input
  // Pass puzzle during playing AND gave-up (so gave-up grid stays navigable)
  const activePuzzle = (phase === "playing" || (phase === "finished" && roomState?.gaveUp)) ? puzzle : null;
  const grid = useGridInput(
    activePuzzle,
    entries,
    sendCellInput,
    mode === "team" ? sendPresence : undefined,
    correctCells
  );

  const [confirmingGiveUp, setConfirmingGiveUp] = useState(false);
  const [confirmingEndGame, setConfirmingEndGame] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Reset dismissed cells when a new check result arrives (checksLeft drops)
  const prevChecksLeft = useRef(checksLeft);
  useEffect(() => {
    if (checksLeft < prevChecksLeft.current) {
      setDismissedWrongCells([]);
    }
    prevChecksLeft.current = checksLeft;
  }, [checksLeft]);

  // Record stats exactly once when game transitions to finished
  const prevPhaseRef = useRef<string>('lobby');
  useEffect(() => {
    if (roomState?.phase === 'finished' && prevPhaseRef.current === 'playing') {
      const opponent   = roomState.players.find((p) => p.id !== playerId);
      const oppId      = opponent?.id   ?? 'opponent';
      const oppName    = opponent?.name ?? 'Partner';
      const myName     = playerName || 'You';
      const isTeam     = roomState.mode === 'team';
      const gaveUp     = roomState.gaveUp;
      const iWon       = gaveUp
        ? roomState.winnerId === playerId          // opponent gave up = I win
        : isTeam
          ? true                                    // team win = both win
          : roomState.winnerId === playerId;
      const gameEnded  = gaveUp || isTeam || roomState.winnerId !== null;

      if (gameEnded) {
        const completionMs = roomState.finishedAt && roomState.startedAt
          ? roomState.finishedAt - roomState.startedAt : 0;
        recordGameResult(playerId, myName, oppId, oppName, roomState.mode, size, iWon, gaveUp, completionMs);
      }
      // Fire sounds + confetti for this player
      if (!gaveUp) {
        if (iWon) { soundWin(); hapticWin(); setShowConfetti(true); setTimeout(() => setShowConfetti(false), 3000); }
        else if (gameEnded) { soundLoss(); }
      } else {
        soundLoss();
      }
    }
    prevPhaseRef.current = roomState?.phase ?? 'lobby';
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
          {phase === "playing" && (
            <button className={styles.endGameBtn} onClick={() => setConfirmingEndGame(true)}>End</button>
          )}
          <ConnectionStatus state={connectionState} />
          <ThemeToggle />
        </div>
      </header>

      {/* ── Game ended by other player banner ── */}
      {gameEndedBy && (
        <div className={styles.gameEndedBanner}>
          {gameEndedBy} ended the game
        </div>
      )}

      {/* ── Sticky active clue bar — stays visible when mobile keyboard opens ── */}
      {phase === "playing" && grid.activeClue && (
        <div className={styles.activeClueBar}>
          <button className={styles.activeClueNav} onClick={grid.goPrevClue} aria-label="Previous clue">‹</button>
          <div className={styles.activeClueText}>
            <span className={styles.activeClueName}>
              {grid.activeClue.number}{grid.activeClue.direction === "across" ? "A" : "D"}
            </span>
            <span className={styles.activeClueBody}>{grid.activeClue.text}</span>
          </div>
          <button className={styles.activeClueNav} onClick={grid.goNextClue} aria-label="Next clue">›</button>
        </div>
      )}

      <div className={styles.body}>
        {/* ── Lobby ── */}
        {phase === "lobby" && (
          <LobbyPanel
            mode={mode} size={size}
            players={roomState?.players ?? []}
            playerId={playerId}
            onStart={startGame}
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
                  correctCells={correctCells}
                  partnerCells={partnerCells}
                  selectedCell={grid.selection.cellIndex}
                  direction={grid.selection.direction}
                  activeWordCells={grid.activeWordCells}
                  onCellClick={(ci) => {
                    if (allWrongCells.includes(ci) && !dismissedWrongCells.includes(ci)) {
                      setDismissedWrongCells((prev) => [...prev, ci]);
                    }
                    grid.selectCell(ci);
                  }}
                  onKeyDown={(e) => {
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

            {/* ── End Game Confirm Dialog ── */}
            {confirmingEndGame && (
              <div className={styles.overlay}>
                <div className={styles.dialog}>
                  <h3 className={styles.dialogTitle}>End game?</h3>
                  <p className={styles.dialogBody}>
                    This will end the game for both players and return to the lobby. No stats will be recorded.
                  </p>
                  <div className={styles.dialogActions}>
                    <button className={styles.dialogCancel} onClick={() => setConfirmingEndGame(false)}>
                      Keep playing
                    </button>
                    <button
                      className={styles.dialogConfirm}
                      onClick={() => { setConfirmingEndGame(false); requestEndGame(); }}
                    >
                      End game
                    </button>
                  </div>
                </div>
              </div>
            )}

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
            onRematch={() => startGame(mode, size)}
            gameMode={mode}
            gameSize={size}
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

              {/* Solved grid — interactive so you can click cells and see clues */}
              <CrosswordGrid
                puzzle={puzzle}
                entries={entries}
                wrongCells={[]}
                correctCells={Object.keys(entries).map(Number)}
                partnerCells={[]}
                selectedCell={grid.selection.cellIndex}
                direction={grid.selection.direction}
                activeWordCells={grid.activeWordCells}
                onCellClick={grid.selectCell}
                gridRef={grid.gridRef}
              />
            </div>

            {/* Clue panel — fully navigable to inspect the solution */}
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
        )}
      </div>
      <Confetti active={showConfetti} />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LobbyPanel({
  mode: initialMode, size: initialSize, players, playerId, onStart,
}: {
  mode: GameMode; size: BoardSize;
  players: { id: string; name: string; isOnline: boolean }[];
  playerId: string;
  onStart: (mode: GameMode, size: BoardSize) => void;
}) {
  const [lobbyMode, setLobbyMode] = useState<GameMode>(initialMode);
  const [lobbySize, setLobbySize] = useState<BoardSize>(initialSize);
  const online = players.filter((p) => p.isOnline);

  return (
    <div className={styles.lobby}>
      <div className={styles.lobbyCard}>
        <h2 className={styles.lobbyTitle}>Waiting room</h2>

        {/* ── Player list ── */}
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

        {/* ── Mode selector ── */}
        <div className={styles.lobbySection}>
          <span className={styles.lobbySectionLabel}>Mode</span>
          <div className={styles.lobbySegmented}>
            {(["vs", "team"] as GameMode[]).map((m) => (
              <button
                key={m}
                className={`${styles.lobbySeg} ${lobbyMode === m ? styles.lobbySegActive : ""}`}
                onClick={() => setLobbyMode(m)}
                data-mode={m}
              >
                {m === "vs" ? "⚔️ VS" : "🤝 Team"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Size selector ── */}
        <div className={styles.lobbySection}>
          <span className={styles.lobbySectionLabel}>Grid size</span>
          <div className={styles.lobbySegmented}>
            {(BOARD_SIZES as BoardSize[]).map((s) => (
              <button
                key={s}
                className={`${styles.lobbySeg} ${lobbySize === s ? styles.lobbySegActive : ""}`}
                onClick={() => setLobbySize(s)}
              >
                {s}×{s}
              </button>
            ))}
          </div>
        </div>

        <button className={styles.startGameBtn} onClick={() => onStart(lobbyMode, lobbySize)}>
          Start game <span>→</span>
        </button>
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
  roomState, playerId, elapsed, onRestart, onRematch,
}: {
  roomState: NonNullable<ReturnType<typeof useGameSocket>["roomState"]>;
  playerId: string; elapsed: number;
  onRestart: () => void;
  onRematch: () => void;
  gameMode: GameMode;
  gameSize: BoardSize;
}) {
  const isTeam   = roomState.mode === "team";
  const gaveUp   = roomState.gaveUp;
  const isWinner = roomState.winnerId === playerId;
  const winner   = roomState.players.find((p) => p.id === roomState.winnerId);

  // Use the server-authoritative completion time (finishedAt - startedAt)
  const completionSec = roomState.finishedAt && roomState.startedAt
    ? Math.floor((roomState.finishedAt - roomState.startedAt) / 1000)
    : elapsed;
  const timeStr = fmt(completionSec);

  if (gaveUp) {
    const emoji = isWinner ? "🏆" : "🏳️";
    const title = isTeam
      ? "You gave up"
      : isWinner
      ? "Opponent gave up — you win!"
      : "You gave up";
    return (
      <div className={styles.finished}>
        <div className={styles.finishedCard}>
          <div className={styles.finishedEmoji}>{emoji}</div>
          <h2 className={styles.finishedTitle}>{title}</h2>
          <p className={styles.finishedTime}>Better luck next time</p>
          <div className={styles.finishedBtns}>
            <button className={styles.rematchBtn} onClick={onRematch}>Rematch ⚡</button>
            <button className={styles.restartBtnAlt} onClick={onRestart}>Change game</button>
          </div>
        </div>
      </div>
    );
  }

  if (isTeam) {
    return (
      <div className={styles.finished}>
        <div className={styles.finishedCard}>
          <div className={styles.finishedEmoji}>🎉</div>
          <h2 className={styles.finishedTitle}>Puzzle solved!</h2>
          <p className={styles.finishedTime}>Finished together in <strong>{timeStr}</strong></p>
          <div className={styles.finishedBtns}>
            <button className={styles.rematchBtn} onClick={onRematch}>Rematch ⚡</button>
            <button className={styles.restartBtnAlt} onClick={onRestart}>Change game</button>
          </div>
        </div>
      </div>
    );
  }

  // VS mode — winner and loser see different screens
  if (isWinner) {
    return (
      <div className={styles.finished}>
        <div className={`${styles.finishedCard} ${styles.finishedWin}`}>
          <div className={styles.finishedEmoji}>🏆</div>
          <h2 className={styles.finishedTitle}>You win!</h2>
          <p className={styles.finishedTime}>Solved in <strong>{timeStr}</strong></p>
          <div className={styles.finishedBtns}>
            <button className={styles.rematchBtn} onClick={onRematch}>Rematch ⚡</button>
            <button className={styles.restartBtnAlt} onClick={onRestart}>Change game</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.finished}>
      <div className={`${styles.finishedCard} ${styles.finishedLoss}`}>
        <div className={styles.finishedEmoji}>💪</div>
        <h2 className={styles.finishedTitle}>
          {winner?.name ?? "Opponent"} wins!
        </h2>
        <p className={styles.finishedSubtitle}>They solved it in <strong>{timeStr}</strong></p>
        <p className={styles.finishedTime} style={{ marginTop: 0 }}>Keep going — you{"'"}ve got this</p>
        <button className={styles.restartBtn} onClick={onRestart}>Play again</button>
      </div>
    </div>
  );
}

function fmt(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}
