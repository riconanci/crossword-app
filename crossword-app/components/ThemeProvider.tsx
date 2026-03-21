// components/ThemeProvider.tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type ColorTheme = "light" | "dark";
export type AccentColor = "default" | "warm" | "cool";

interface ThemeContextValue {
  theme: ColorTheme;
  accent: AccentColor;
  toggleTheme: () => void;
  setAccent: (a: AccentColor) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  accent: "default",
  toggleTheme: () => {},
  setAccent: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ColorTheme>("light");
  const [accent, setAccentState] = useState<AccentColor>("default");

  // Read saved preferences on mount (runs only client-side)
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") as ColorTheme | null;
    const savedAccent = localStorage.getItem("accent") as AccentColor | null;

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolvedTheme = savedTheme ?? (prefersDark ? "dark" : "light");

    setTheme(resolvedTheme);
    if (savedAccent) setAccentState(savedAccent);

    applyTheme(resolvedTheme, savedAccent ?? "default");
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem("theme", next);
      applyTheme(next, accent);
      return next;
    });
  }, [accent]);

  const setAccent = useCallback((a: AccentColor) => {
    setAccentState(a);
    localStorage.setItem("accent", a);
    applyTheme(theme, a);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, accent, toggleTheme, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

function applyTheme(theme: ColorTheme, accent: AccentColor) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  if (accent === "default") {
    root.removeAttribute("data-accent");
  } else {
    root.setAttribute("data-accent", accent);
  }
}
