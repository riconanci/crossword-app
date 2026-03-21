// components/ThemeToggle.tsx
"use client";

import { useTheme } from "./ThemeProvider";
import styles from "./ThemeToggle.module.css";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      className={styles.toggle}
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      <span className={styles.icon}>{isDark ? "☀️" : "🌙"}</span>
    </button>
  );
}
