// partykit/server.ts
// Authoritative game server running on PartyKit edge.
// One permanent room: "me-and-gf"
// Handles: state sync, cell inputs, checker, validation, win detection.

import type * as Party from "partykit/server";
import type {
  C2SMessage,
  S2CMessage,
  RoomState,
  Player,
  VSPlayerState,
  TeamState,
  TeamPresence,
  GameMode,
  BoardSize,
  PuzzleWithAnswers,
  Puzzle,
  CellValue,
} from "../lib/types";
import { CHECKS_PER_GAME, ACTIVE_TIMEOUT_MS } from "../lib/constants";
import { generatePuzzle } from "../lib/puzzleGenerator";

// ─── Server class ─────────────────────────────────────────────────────────────

export default class CrosswordServer implements Party.Server {
  /** Persistent state stored in PartyKit storage */
  private roomState: RoomState;
  /** Full puzzle with answers — NEVER sent to clients */
  private puzzleWithAnswers: PuzzleWithAnswers | null = null;

  constructor(readonly room: Party.Room) {
    this.roomState = this.makeInitialState();
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async onStart() {
    // Rehydrate state from durable storage on cold start
    const saved = await this.room.storage.get<RoomState>("roomState");
    const savedPuzzle = await this.room.storage.get<PuzzleWithAnswers>("puzzleWithAnswers");
    if (saved) this.roomState = saved;
    if (savedPuzzle) this.puzzleWithAnswers = savedPuzzle;
  }

  async onConnect(conn: Party.Connection) {
    // Send the new connection the current full state snapshot
    this.sendTo(conn, { type: "roomState", state: this.roomState });
  }

  async onClose(conn: Party.Connection) {
    this.markPlayerOffline(conn.id);
    this.broadcast({ type: "playerLeft", playerId: conn.id });
    await this.persist();
  }

  async onMessage(message: string, sender: Party.Connection) {
    let msg: C2SMessage;
    try {
      msg = JSON.parse(message) as C2SMessage;
    } catch {
      return;
    }

    await this.handleMessage(msg, sender);
  }

  // ── Message Router ───────────────────────────────────────────────────────────

  private async handleMessage(msg: C2SMessage, sender: Party.Connection) {
    switch (msg.type) {
      case "join":
        return this.handleJoin(msg.playerId, msg.playerName, sender);
      case "startGame":
        return this.handleStartGame(msg.mode, msg.size, sender);
      case "cellInput":
        return this.handleCellInput(msg.cellIndex, msg.value, sender);
      case "requestCheck":
        return this.handleCheck(sender);
      case "requestValidate":
        return this.handleValidate(sender);
      case "presenceUpdate":
        return this.handlePresence(msg, sender);
      case "requestRestart":
        return this.handleRestart(sender);
      case "requestGiveUp":
        return this.handleGiveUp(sender);
    }
  }

  // ── Handlers ─────────────────────────────────────────────────────────────────

  private handleJoin(playerId: string, playerName: string, conn: Party.Connection) {
    const existing = this.roomState.players.find((p) => p.id === playerId);

    if (existing) {
      // Reconnect: update online status + name
      existing.isOnline = true;
      existing.name = playerName || existing.name;
    } else {
      // Reject if room is full (>2 players)
      const online = this.roomState.players.filter((p) => p.isOnline);
      if (online.length >= 2) {
        this.sendTo(conn, { type: "error", message: "Room is full (2 players max)." });
        return;
      }

      const newPlayer: Player = {
        id: playerId,
        name: playerName || `Player ${this.roomState.players.length === 0 ? "A" : "B"}`,
        joinedAt: Date.now(),
        isOnline: true,
      };
      this.roomState.players.push(newPlayer);
      this.broadcast({ type: "playerJoined", player: newPlayer });
    }

    // Send updated full state to everyone
    this.broadcastRoomState();
    this.persist();
  }

  private async handleStartGame(mode: GameMode, size: BoardSize, sender: Party.Connection) {
    // Only allow starting from lobby
    if (this.roomState.phase === "playing") {
      this.sendTo(sender, { type: "error", message: "Game already in progress." });
      return;
    }

    // Generate puzzle
    const puzzleWithAnswers = generatePuzzle(size);
    this.puzzleWithAnswers = puzzleWithAnswers;

    // Strip answers before storing in room state
    const puzzle: Puzzle = stripAnswers(puzzleWithAnswers);

    // Build mode-specific initial state
    const players = this.roomState.players;
    let vsState: RoomState["vsState"] = null;
    let teamState: RoomState["teamState"] = null;

    if (mode === "vs") {
      vsState = {};
      for (const p of players) {
        vsState[p.id] = makeVSPlayerState(p.id);
      }
    } else {
      teamState = {
        entries: {},
        checksRemaining: CHECKS_PER_GAME,
        incorrectCells: [],
        presence: {},
        isComplete: false,
        isCorrect: null,
      };
    }

    this.roomState = {
      ...this.roomState,
      mode,
      boardSize: size,
      phase: "playing",
      puzzle,
      vsState,
      teamState,
      startedAt: Date.now(),
      finishedAt: null,
      winnerId: null,
      gaveUp: false,
    };

    this.broadcast({
      type: "gameStarted",
      puzzle,
      vsState,
      teamState,
      startedAt: this.roomState.startedAt!,
    });

    await this.persist();
  }

  private async handleCellInput(cellIndex: number, value: CellValue, sender: Party.Connection) {
    if (this.roomState.phase !== "playing") return;

    const senderId = this.getPlayerId(sender.id);
    if (!senderId) return;

    const normalizedValue = value.toUpperCase().slice(0, 1);

    if (this.roomState.mode === "vs") {
      await this.handleVSInput(cellIndex, normalizedValue, senderId);
    } else {
      await this.handleTeamInput(cellIndex, normalizedValue, senderId);
    }
  }

  private async handleVSInput(cellIndex: number, value: CellValue, playerId: string) {
    const vs = this.roomState.vsState;
    if (!vs || !vs[playerId]) return;

    // Update entry
    vs[playerId].entries[cellIndex] = value;
    vs[playerId].lastActiveAt = Date.now();

    // Recalculate progress
    vs[playerId].progress = calcProgress(
      vs[playerId].entries,
      this.roomState.puzzle!
    );

    // Broadcast progress update to opponent
    this.broadcast({
      type: "vsProgressUpdate",
      playerId,
      progress: vs[playerId].progress,
      lastActiveAt: vs[playerId].lastActiveAt,
      isActive: true,
    });

    // Auto-validate when all non-black cells are filled
    if (vs[playerId].progress === 100 && !vs[playerId].isFinished) {
      await this.validatePlayer(playerId);
    }

    await this.persist();
  }

  private async handleTeamInput(cellIndex: number, value: CellValue, playerId: string) {
    const team = this.roomState.teamState;
    if (!team) return;

    team.entries[cellIndex] = value;

    this.broadcast({
      type: "teamEntryUpdate",
      playerId,
      cellIndex,
      value,
    });

    // Auto-validate when fully filled
    const progress = calcProgress(team.entries, this.roomState.puzzle!);
    if (progress === 100 && !team.isComplete) {
      await this.validateTeam();
    }

    await this.persist();
  }

  private async handleCheck(sender: Party.Connection) {
    if (this.roomState.phase !== "playing") return;
    if (!this.puzzleWithAnswers) return;

    const playerId = this.getPlayerId(sender.id);
    if (!playerId) return;

    if (this.roomState.mode === "vs") {
      const vs = this.roomState.vsState![playerId];
      if (!vs || vs.checksRemaining <= 0) {
        this.sendTo(sender, { type: "error", message: "No checks remaining." });
        return;
      }

      const incorrectCells = findIncorrectCells(
        vs.entries,
        this.puzzleWithAnswers.answers
      );
      vs.checksRemaining--;
      vs.incorrectCells = incorrectCells;

      // Only send check result to the player who requested it
      this.sendTo(sender, {
        type: "checkResult",
        playerId,
        incorrectCells,
        checksRemaining: vs.checksRemaining,
      });
    } else {
      const team = this.roomState.teamState!;
      if (team.checksRemaining <= 0) {
        this.sendTo(sender, { type: "error", message: "No checks remaining." });
        return;
      }

      const incorrectCells = findIncorrectCells(
        team.entries,
        this.puzzleWithAnswers.answers
      );
      team.checksRemaining--;
      team.incorrectCells = incorrectCells;

      // Broadcast to whole team
      this.broadcast({
        type: "checkResult",
        playerId,
        incorrectCells,
        checksRemaining: team.checksRemaining,
      });
    }

    await this.persist();
  }

  private async handleValidate(sender: Party.Connection) {
    if (this.roomState.phase !== "playing") return;
    const playerId = this.getPlayerId(sender.id);
    if (!playerId) return;

    if (this.roomState.mode === "vs") {
      await this.validatePlayer(playerId, sender);
    } else {
      await this.validateTeam();
    }
  }

  private handlePresence(
    msg: Extract<C2SMessage, { type: "presenceUpdate" }>,
    sender: Party.Connection
  ) {
    if (this.roomState.mode !== "team" || !this.roomState.teamState) return;

    const playerId = this.getPlayerId(sender.id);
    if (!playerId) return;

    const presence: TeamPresence = {
      playerId,
      focusedCellIndex: msg.cellIndex,
      focusedWordCells: msg.wordCells,
      direction: msg.direction,
      activeClueLabel: msg.clueLabel,
    };

    this.roomState.teamState.presence[playerId] = presence;

    // Broadcast to the OTHER player only (you already know your own cursor)
    for (const conn of this.room.getConnections()) {
      if (conn.id !== sender.id) {
        this.sendTo(conn, { type: "presenceUpdate", playerId, presence });
      }
    }
  }


  private async handleGiveUp(sender: Party.Connection) {
    if (this.roomState.phase !== "playing") return;
    if (!this.puzzleWithAnswers) return;

    const senderId = this.getPlayerId(sender.id);
    if (!senderId) return;

    const now = Date.now();
    const revealedEntries = this.puzzleWithAnswers.answers;

    this.roomState.phase = "finished";
    this.roomState.finishedAt = now;
    this.roomState.gaveUp = true;

    if (this.roomState.mode === "vs") {
      // Giver-upper loses; the OTHER player wins
      const opponent = this.roomState.players.find((p) => p.id !== senderId);
      this.roomState.winnerId = opponent?.id ?? null;

      this.broadcast({
        type: "gameOver",
        winnerId: this.roomState.winnerId,
        winnerName: opponent?.name ?? null,
        completionTimeMs: now - (this.roomState.startedAt ?? 0),
        gaveUp: true,
        revealedEntries,
      });
    } else {
      // Team mode — both players lose
      this.roomState.winnerId = null;

      this.broadcast({
        type: "gameOver",
        winnerId: null,
        winnerName: null,
        completionTimeMs: now - (this.roomState.startedAt ?? 0),
        gaveUp: true,
        revealedEntries,
      });
    }

    await this.persist();
  }

  private async handleRestart(_sender: Party.Connection) {
    this.roomState = {
      ...this.makeInitialState(),
      players: this.roomState.players.map((p) => ({ ...p, isOnline: p.isOnline })),
    };
    this.puzzleWithAnswers = null;
    this.broadcastRoomState();
    await this.persist();
  }

  // ── Validation logic ──────────────────────────────────────────────────────────

  private async validatePlayer(playerId: string, conn?: Party.Connection) {
    const vs = this.roomState.vsState![playerId];
    if (!vs || !this.puzzleWithAnswers) return;

    const incorrectCells = findIncorrectCells(
      vs.entries,
      this.puzzleWithAnswers.answers
    );
    const isCorrect = incorrectCells.length === 0;

    vs.isFinished = true;
    vs.isCorrect = isCorrect;
    vs.incorrectCells = incorrectCells;

    const isWinner = isCorrect;

    this.broadcast({
      type: "validateResult",
      playerId,
      isCorrect,
      isWinner,
      incorrectCells,
    });

    if (isWinner) {
      const winner = this.roomState.players.find((p) => p.id === playerId);
      this.roomState.phase = "finished";
      this.roomState.winnerId = playerId;
      this.roomState.finishedAt = Date.now();

      this.broadcast({
        type: "gameOver",
        winnerId: playerId,
        winnerName: winner?.name ?? null,
        completionTimeMs: this.roomState.finishedAt - (this.roomState.startedAt ?? 0),
        gaveUp: false,
        revealedEntries: {},
      });
    }

    await this.persist();
  }

  private async validateTeam() {
    const team = this.roomState.teamState;
    if (!team || !this.puzzleWithAnswers) return;

    const incorrectCells = findIncorrectCells(
      team.entries,
      this.puzzleWithAnswers.answers
    );
    const isCorrect = incorrectCells.length === 0;

    team.isComplete = true;
    team.isCorrect = isCorrect;
    team.incorrectCells = incorrectCells;

    if (isCorrect) {
      this.roomState.phase = "finished";
      this.roomState.finishedAt = Date.now();

      this.broadcast({
        type: "gameOver",
        winnerId: null, // team victory — no individual winner
        winnerName: null,
        completionTimeMs: this.roomState.finishedAt - (this.roomState.startedAt ?? 0),
        gaveUp: false,
        revealedEntries: {},
      });
    } else {
      // Not correct — let players keep going; broadcast the updated team state
      this.broadcastRoomState();
    }

    await this.persist();
  }

  // ── Utilities ─────────────────────────────────────────────────────────────────

  private makeInitialState(): RoomState {
    return {
      roomId: this.room.id,
      mode: "vs",
      boardSize: 7,
      phase: "lobby",
      players: this.roomState?.players ?? [],
      puzzle: null,
      vsState: null,
      teamState: null,
      startedAt: null,
      finishedAt: null,
      winnerId: null,
      gaveUp: false,
    };
  }

  private markPlayerOffline(connId: string) {
    const player = this.roomState.players.find((p) => p.id === connId);
    if (player) player.isOnline = false;
  }

  /** Resolve PartyKit connection id → game player id.
   *  Since we use playerId (UUID from localStorage) as the canonical id
   *  and pass it on "join", we store a mapping. For simplicity in Phase 1,
   *  connection id == player id (client sets this via query param). */
  private getPlayerId(connId: string): string | null {
    // Connection ID may differ from player UUID — look up by connection id
    // In our setup the client passes playerId as the connection identifier
    return this.roomState.players.find((p) => p.id === connId)?.id ?? connId;
  }

  private sendTo(conn: Party.Connection, msg: S2CMessage) {
    conn.send(JSON.stringify(msg));
  }

  private broadcast(msg: S2CMessage) {
    const payload = JSON.stringify(msg);
    for (const conn of this.room.getConnections()) {
      conn.send(payload);
    }
  }

  private broadcastRoomState() {
    this.broadcast({ type: "roomState", state: this.roomState });
  }

  private async persist() {
    await this.room.storage.put("roomState", this.roomState);
    if (this.puzzleWithAnswers) {
      await this.room.storage.put("puzzleWithAnswers", this.puzzleWithAnswers);
    }
  }
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function makeVSPlayerState(playerId: string): VSPlayerState {
  return {
    playerId,
    entries: {},
    progress: 0,
    checksRemaining: CHECKS_PER_GAME,
    lastActiveAt: Date.now(),
    isFinished: false,
    isCorrect: null,
    incorrectCells: [],
  };
}

function calcProgress(
  entries: Record<number, CellValue>,
  puzzle: Puzzle
): number {
  const fillableCells = puzzle.cells.filter((c) => !c.isBlack);
  if (fillableCells.length === 0) return 0;
  const filled = fillableCells.filter(
    (c) => entries[c.index] && entries[c.index] !== ""
  ).length;
  return Math.round((filled / fillableCells.length) * 100);
}

function findIncorrectCells(
  entries: Record<number, CellValue>,
  answers: Record<number, string>
): number[] {
  return Object.entries(entries)
    .filter(([idx, val]) => val !== "" && val !== answers[Number(idx)])
    .map(([idx]) => Number(idx));
}

function stripAnswers(puzzle: PuzzleWithAnswers): Puzzle {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { answers, ...rest } = puzzle;
  return rest;
}
