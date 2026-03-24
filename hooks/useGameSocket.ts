// hooks/useGameSocket.ts
// Central hook: connects to PartyKit, manages RoomState, exposes actions.
// Falls back to local demo mode if PartyKit is unreachable after 3 seconds.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { soundWin, soundLoss, soundWrong, soundCheckClear } from "@/lib/sounds";
import { hapticWin, hapticWrong } from "@/lib/haptics";
import PartySocket from "partysocket";
import { createGameSocket } from "@/lib/socket";
import { ACTIVE_TIMEOUT_MS } from "@/lib/constants";
import {
  demoStartGame,
  demoApplyCellInput,
  demoCheck,
  demoValidate,
  demoRestart,
} from "@/lib/demoMode";
import type {
  C2SMessage,
  S2CMessage,
  RoomState,
  VSPlayerState,
  GameMode,
  BoardSize,
  Direction,
} from "@/lib/types";

export type ConnectionState = "connecting" | "connected" | "disconnected" | "error" | "demo";

export interface OpponentProgress {
  progress: number;
  isActive: boolean;
  lastActiveAt: number;
}

export interface GameSocketReturn {
  connectionState: ConnectionState;
  roomState: RoomState | null;
  myPlayerId: string;
  opponentProgress: OpponentProgress | null;
  send: (msg: C2SMessage) => void;
  joinRoom: (name: string) => void;
  startGame: (mode: GameMode, size: BoardSize) => void;
  sendCellInput: (cellIndex: number, value: string) => void;
  sendPresence: (cellIndex: number | null, wordCells: number[], direction: Direction, clueLabel: string) => void;
  requestCheck: () => void;
  requestValidate: () => void;
  requestRestart: () => void;
  requestGiveUp: () => void;
  requestEndGame: () => void;
  gameEndedBy: string | null;
  /** Snapshot of entries at the exact moment the last check was performed.
   *  Cells here that are NOT in wrongCells are definitively correct and locked. */
  checkedEntries: Record<number, string> | null;
}

// How long to wait for PartyKit before switching to demo mode
const DEMO_FALLBACK_MS = 3000;

export function useGameSocket(playerId: string): GameSocketReturn {
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [opponentProgress, setOpponentProgress] = useState<OpponentProgress | null>(null);
  const [checkedEntries, setCheckedEntries] = useState<Record<number, string> | null>(null);

  // Keep ref in sync for use inside callbacks without stale closure
  useEffect(() => { roomStateRef.current = roomState; }, [roomState]);
  const [gameEndedBy, setGameEndedBy] = useState<string | null>(null);

  const socketRef = useRef<PartySocket | null>(null);
  const sendRef = useRef<(msg: C2SMessage) => void>(() => {});
  const activeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDemoRef = useRef(false);
  const roomStateRef = useRef<typeof roomState>(null);
  const playerNameRef = useRef("Player");

  // ── Demo mode helpers ──────────────────────────────────────────────────────

  const setDemo = useCallback(() => {
    isDemoRef.current = true;
    setConnectionState("demo");
    // Build a lobby state so the UI shows the waiting room
    setRoomState({
      roomId: "demo",
      mode: "vs",
      boardSize: 7,
      phase: "lobby",
      players: [
        { id: playerId, name: playerNameRef.current, joinedAt: Date.now(), isOnline: true },
        { id: "opponent", name: "Partner (sim)", joinedAt: Date.now(), isOnline: true },
      ],
      puzzle: null,
      vsState: null,
      teamState: null,
      startedAt: null,
      finishedAt: null,
      winnerId: null,
      gaveUp: false,
    });
  }, [playerId]);

  // ── PartyKit message handler ───────────────────────────────────────────────

  const handleMessage = useCallback((msg: S2CMessage) => {
    switch (msg.type) {
      case "roomState":
        setRoomState(msg.state);
        break;

      case "playerJoined":
        setRoomState((prev) =>
          prev
            ? {
                ...prev,
                players: prev.players.some((p) => p.id === msg.player.id)
                  ? prev.players.map((p) => (p.id === msg.player.id ? msg.player : p))
                  : [...prev.players, msg.player],
              }
            : prev
        );
        break;

      case "playerLeft":
        setRoomState((prev) =>
          prev
            ? {
                ...prev,
                players: prev.players.map((p) =>
                  p.id === msg.playerId ? { ...p, isOnline: false } : p
                ),
              }
            : prev
        );
        break;

      case "gameStarted":
        setCheckedEntries(null); // reset check snapshot for new game
        if (typeof window !== 'undefined') localStorage.setItem('cw-game-active', 'yes');
        setRoomState((prev) =>
          prev
            ? {
                ...prev,
                phase: "playing",
                puzzle: msg.puzzle,
                vsState: msg.vsState,
                teamState: msg.teamState,
                startedAt: msg.startedAt,
              }
            : prev
        );
        break;

      case "vsProgressUpdate":
        if (msg.playerId !== playerId) {
          setOpponentProgress({ progress: msg.progress, isActive: msg.isActive, lastActiveAt: msg.lastActiveAt });
          if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
          if (msg.isActive) {
            activeTimerRef.current = setTimeout(() => {
              setOpponentProgress((prev) => prev ? { ...prev, isActive: false } : prev);
            }, ACTIVE_TIMEOUT_MS);
          }
        }
        break;

      case "teamEntryUpdate":
        setRoomState((prev) => {
          if (!prev?.teamState) return prev;
          return {
            ...prev,
            teamState: { ...prev.teamState, entries: { ...prev.teamState.entries, [msg.cellIndex]: msg.value } },
          };
        });
        break;

      case "checkResult":
        if (msg.incorrectCells.length > 0) { soundWrong(); hapticWrong(); }
        else { soundCheckClear(); }
        setRoomState((prev) => {
          if (!prev) return prev;
          if (prev.mode === "vs" && prev.vsState) {
            const existing = prev.vsState[msg.playerId];
            if (!existing) return prev;
            const updated: VSPlayerState = { ...existing, incorrectCells: msg.incorrectCells, checksRemaining: msg.checksRemaining };
            return { ...prev, vsState: { ...prev.vsState, [msg.playerId]: updated } } as RoomState;
          }
          if (prev.mode === "team" && prev.teamState) {
            return { ...prev, teamState: { ...prev.teamState, incorrectCells: msg.incorrectCells, checksRemaining: msg.checksRemaining } };
          }
          return prev;
        });
        break;

      case "validateResult":
        setRoomState((prev) => {
          if (!prev?.vsState) return prev;
          const existing = prev.vsState[msg.playerId];
          if (!existing) return prev;
          const updated: VSPlayerState = { ...existing, isFinished: true, isCorrect: msg.isCorrect, incorrectCells: msg.incorrectCells };
          return { ...prev, vsState: { ...prev.vsState, [msg.playerId]: updated } } as RoomState;
        });
        break;

      case "presenceUpdate":
        setRoomState((prev) => {
          if (!prev?.teamState) return prev;
          return { ...prev, teamState: { ...prev.teamState, presence: { ...prev.teamState.presence, [msg.playerId]: msg.presence } } };
        });
        break;

      case "gameOver":
        if (typeof window !== 'undefined') localStorage.removeItem('cw-game-active');
        if (msg.gaveUp) { soundLoss(); }
        setRoomState((prev) => {
          if (!prev) return prev;
          let next = { ...prev, phase: "finished" as const, winnerId: msg.winnerId, finishedAt: Date.now(), gaveUp: msg.gaveUp };
          // Apply revealed answers to the board when giving up
          if (msg.gaveUp && Object.keys(msg.revealedEntries).length > 0) {
            if (prev.mode === "vs" && next.vsState) {
              // Apply revealed entries to ALL VS players so both sides see the solution
              const updatedVsState = { ...next.vsState };
              for (const pid of Object.keys(updatedVsState)) {
                updatedVsState[pid] = { ...updatedVsState[pid]!, entries: msg.revealedEntries };
              }
              next = { ...next, vsState: updatedVsState } as typeof next;
            } else if (prev.mode === "team" && next.teamState) {
              next = { ...next, teamState: { ...next.teamState, entries: msg.revealedEntries } };
            }
          }
          return next;
        });
        // Stats recorded in game/page.tsx via recordGameResult
        break;

      case "gameEnded":
        // Server already reset state; the following roomState message will update UI.
        // Store the name so game page can show a brief banner.
        setGameEndedBy(msg.endedByName);
        setTimeout(() => setGameEndedBy(null), 4000);
        break;

      case "error":
        console.error("[game] Server error:", msg.message);
        break;
    }
  }, [playerId]);

  // ── Socket setup ───────────────────────────────────────────────────────────

  useEffect(() => {
    const { socket, send } = createGameSocket({
      onMessage: handleMessage,
      onOpen: () => {
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
        setConnectionState("connected");
        send({ type: "join", playerId, playerName: playerNameRef.current });
      },
      onClose: () => {
        if (!isDemoRef.current) setConnectionState("disconnected");
      },
      onError: () => {
        if (!isDemoRef.current) setConnectionState("error");
      },
    });

    socketRef.current = socket;
    sendRef.current = send;

    // Fall back to demo mode if no connection after timeout
    fallbackTimerRef.current = setTimeout(() => {
      if (connectionState !== "connected") {
        console.info("[socket] PartyKit unreachable — switching to demo mode");
        setDemo();
      }
    }, DEMO_FALLBACK_MS);

    return () => {
      socket.close();
      if (activeTimerRef.current) clearTimeout(activeTimerRef.current);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId]);

  // ── Typed action helpers ───────────────────────────────────────────────────

  const send = useCallback((msg: C2SMessage) => {
    if (!isDemoRef.current) sendRef.current(msg);
  }, []);

  const joinRoom = useCallback((name: string) => {
    playerNameRef.current = name;
    if (!isDemoRef.current) {
      sendRef.current({ type: "join", playerId, playerName: name });
    } else {
      // Update player name in demo state
      setRoomState((prev) =>
        prev
          ? { ...prev, players: prev.players.map((p) => p.id === playerId ? { ...p, name } : p) }
          : prev
      );
    }
  }, [playerId]);

  const startGame = useCallback((mode: GameMode, size: BoardSize) => {
    if (isDemoRef.current) {
      setCheckedEntries(null);
      const newState = demoStartGame(playerId, playerNameRef.current, mode, size);
      setRoomState(newState);
    } else {
      sendRef.current({ type: "startGame", mode, size });
    }
  }, [playerId]);

  const sendCellInput = useCallback((cellIndex: number, value: string) => {
    if (isDemoRef.current) {
      setRoomState((prev) => prev ? demoApplyCellInput(prev, playerId, cellIndex, value) : prev);
    } else {
      // Optimistically update own entries so letters appear immediately.
      // Server is authoritative but never echoes VS entries back to sender.
      setRoomState((prev) => {
        if (!prev) return prev;
        if (prev.mode === "vs" && prev.vsState?.[playerId]) {
          const me = prev.vsState[playerId]!;
          const entries = { ...me.entries, [cellIndex]: value };
          return {
            ...prev,
            vsState: { ...prev.vsState, [playerId]: { ...me, entries } },
          };
        }
        return prev;
      });
      sendRef.current({ type: "cellInput", cellIndex, value });
    }
  }, [playerId]);

  const sendPresence = useCallback(
    (cellIndex: number | null, wordCells: number[], direction: Direction, clueLabel: string) => {
      if (!isDemoRef.current) {
        sendRef.current({ type: "presenceUpdate", cellIndex, wordCells, direction, clueLabel });
      }
    },
    []
  );

  const requestCheck = useCallback(() => {
    if (isDemoRef.current) {
      // Snapshot entries before the check modifies incorrectCells
      setRoomState((prev) => {
        if (!prev) return prev;
        const currentEntries =
          prev.mode === 'vs' ? (prev.vsState?.[playerId]?.entries ?? {}) : (prev.teamState?.entries ?? {});
        setCheckedEntries({ ...currentEntries });
        return demoCheck(prev, playerId);
      });
    } else {
      // Snapshot current entries right when the check is requested
      setRoomState((prev) => {
        if (!prev) return prev;
        const currentEntries =
          prev.mode === 'vs' ? (prev.vsState?.[playerId]?.entries ?? {}) : (prev.teamState?.entries ?? {});
        setCheckedEntries({ ...currentEntries });
        return prev;
      });
      sendRef.current({ type: "requestCheck", entries: (() => {
        const s = roomStateRef.current;
        if (!s) return {};
        return s.mode === 'vs' ? (s.vsState?.[playerId]?.entries ?? {}) : (s.teamState?.entries ?? {});
      })() });
    }
  }, [playerId]);

  const requestValidate = useCallback(() => {
    if (isDemoRef.current) {
      setRoomState((prev) => prev ? demoValidate(prev, playerId) : prev);
    } else {
      sendRef.current({ type: "requestValidate" });
    }
  }, [playerId]);

  const requestEndGame = useCallback(() => {
    if (isDemoRef.current) {
      // In demo mode just restart
      setRoomState((prev) => {
        if (!prev) return prev;
        return { ...prev, phase: "lobby", puzzle: null, vsState: null, teamState: null, gaveUp: false };
      });
    } else {
      sendRef.current({ type: "requestEndGame" });
    }
  }, []);

  const requestGiveUp = useCallback(() => {
    if (isDemoRef.current) {
      setRoomState((prev) => {
        if (!prev) return prev;
        const { demoGiveUp } = require('@/lib/demoMode');
        return demoGiveUp(prev, playerId);
      });
      // Stats recorded in game/page.tsx
    } else {
      sendRef.current({ type: 'requestGiveUp' });
    }
  }, [playerId]);

  const requestRestart = useCallback(() => {
    setCheckedEntries(null);
    if (typeof window !== "undefined") localStorage.removeItem("cw-game-active");
    if (isDemoRef.current) {
      const base = demoRestart(playerId);
      setRoomState({ ...base, puzzle: null, vsState: null, teamState: null });
    } else {
      sendRef.current({ type: "requestRestart" });
    }
  }, [playerId]);

  return {
    connectionState,
    roomState,
    myPlayerId: playerId,
    opponentProgress,
    send,
    joinRoom,
    startGame,
    sendCellInput,
    sendPresence,
    requestCheck,
    requestValidate,
    requestRestart,
    requestGiveUp,
    requestEndGame,
    checkedEntries,
    gameEndedBy,
  };
}
