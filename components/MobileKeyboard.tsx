// components/MobileKeyboard.tsx
// Custom on-screen keyboard for mobile.
// Shown only on touch devices when a cell is selected.
// Completely replaces the native iOS/Android keyboard — no focus tricks needed.

"use client";

import styles from "./MobileKeyboard.module.css";

const ROWS = [
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M","→"],
];

interface Props {
  onKey: (key: string) => void;
}

export function MobileKeyboard({ onKey }: Props) {
  return (
    <div className={styles.keyboard}>
      {ROWS.map((row, ri) => (
        <div key={ri} className={styles.row}>
          {row.map((key) => {
            const isNext    = key === "→";
            const isSpecial = isNext;
            return (
              <button
                key={key}
                className={`${styles.key} ${isSpecial ? styles.keySpecial : ""}`}
                // onPointerDown for instant response — don't wait for click
                onPointerDown={(e) => {
                  e.preventDefault(); // prevent any focus change
                  if (isNext)  onKey("Tab");
                  else              onKey(key);
                }}
              >
                {key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
