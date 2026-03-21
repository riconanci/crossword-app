// lib/socket.ts
// Thin wrapper around PartySocket with typed send/receive helpers.
// Used by the useGameSocket hook in hooks/useGameSocket.ts.

import PartySocket from "partysocket";
import { PARTYKIT_HOST, ROOM_ID } from "./constants";
import type { C2SMessage, S2CMessage } from "./types";

export type MessageHandler = (msg: S2CMessage) => void;

export interface SocketOptions {
  onMessage: MessageHandler;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (err: Event) => void;
}

/**
 * Creates a typed PartySocket connection to the permanent game room.
 * Returns the socket instance and a typed `send` helper.
 */
export function createGameSocket(options: SocketOptions): {
  socket: PartySocket;
  send: (msg: C2SMessage) => void;
} {
  const socket = new PartySocket({
    host: PARTYKIT_HOST,
    room: ROOM_ID,
    // Reconnect automatically up to 10 times
    maxRetries: 10,
  });

  socket.onopen = () => options.onOpen?.();
  socket.onclose = () => options.onClose?.();
  socket.onerror = (err) => options.onError?.(err);

  socket.onmessage = (event: MessageEvent<string>) => {
    try {
      const msg = JSON.parse(event.data) as S2CMessage;
      options.onMessage(msg);
    } catch (err) {
      console.error("[socket] Failed to parse message:", event.data, err);
    }
  };

  const send = (msg: C2SMessage) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    } else {
      console.warn("[socket] Attempted send while not connected:", msg.type);
    }
  };

  return { socket, send };
}
