// hooks/usePlayerIdentity.ts
// Generates and persists a stable "Player A / Player B" identity.
// No auth — just localStorage. Two devices = two players.

"use client";

import { useEffect, useState } from "react";

export interface PlayerIdentity {
  playerId: string;
  playerName: string;
  setPlayerName: (name: string) => void;
  isReady: boolean;
}

/**
 * Returns a stable player identity stored in localStorage.
 * On first visit a UUID is generated and saved.
 * The human-readable name defaults to "Player A" or "Player B"
 * based on join order (assigned by server); users can override it.
 */
export function usePlayerIdentity(): PlayerIdentity {
  const [playerId, setPlayerId] = useState("");
  const [playerName, setPlayerNameState] = useState("");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let id = localStorage.getItem("crossword:playerId");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("crossword:playerId", id);
    }

    const storedName =
      localStorage.getItem(`playerName:${id}`) ?? "";

    setPlayerId(id);
    setPlayerNameState(storedName);
    setIsReady(true);
  }, []);

  const setPlayerName = (name: string) => {
    setPlayerNameState(name);
    if (playerId) {
      localStorage.setItem(`playerName:${playerId}`, name);
    }
  };

  return { playerId, playerName, setPlayerName, isReady };
}
