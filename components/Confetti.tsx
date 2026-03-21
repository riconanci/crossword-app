// components/Confetti.tsx
// Pure CSS + React confetti burst. No dependencies.
// Renders 60 particles from the center of the screen, animates out, then unmounts.

"use client";

import { useEffect, useState } from "react";
import styles from "./Confetti.module.css";

const COLORS = ["#f59e0b","#10b981","#3b82f6","#f43f5e","#a855f7","#06b6d4","#eab308"];
const COUNT  = 60;

interface Particle {
  id: number;
  color: string;
  x: number;   // vx direction -1 to 1
  y: number;   // vy direction (always negative = upward burst then gravity)
  rot: number; // initial rotation deg
  size: number;
  delay: number;
}

function makeParticles(): Particle[] {
  return Array.from({ length: COUNT }, (_, i) => ({
    id: i,
    color: COLORS[i % COLORS.length]!,
    x: (Math.random() - 0.5) * 2,
    y: -(Math.random() * 0.6 + 0.6),
    rot: Math.random() * 360,
    size: Math.random() * 6 + 5,
    delay: Math.random() * 0.3,
  }));
}

interface Props {
  active: boolean;
}

export function Confetti({ active }: Props) {
  const [particles, setParticles] = useState<Particle[]>([]);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) return;
    setParticles(makeParticles());
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 2800);
    return () => clearTimeout(t);
  }, [active]);

  if (!visible || particles.length === 0) return null;

  return (
    <div className={styles.container} aria-hidden>
      {particles.map((p) => (
        <div
          key={p.id}
          className={styles.particle}
          style={{
            "--x":     p.x,
            "--y":     p.y,
            "--rot":   `${p.rot}deg`,
            "--size":  `${p.size}px`,
            "--color": p.color,
            "--delay": `${p.delay}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}
