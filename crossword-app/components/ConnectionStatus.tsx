// components/ConnectionStatus.tsx
"use client";

import type { ConnectionState } from "@/hooks/useGameSocket";
import styles from "./ConnectionStatus.module.css";

interface Props {
  state: ConnectionState;
}

const LABELS: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Connection error",
  demo: "Demo mode",
};

export function ConnectionStatus({ state }: Props) {
  return (
    <div className={`${styles.badge} ${styles[state]}`} role="status">
      <span className={styles.dot} />
      <span className={styles.label}>{LABELS[state]}</span>
    </div>
  );
}
