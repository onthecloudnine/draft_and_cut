"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

type ThemeContextValue = {
  theme: ThemeMode;
  setTheme: (next: ThemeMode) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = "dc:theme";

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readInitialTheme(): ThemeMode {
  if (typeof document === "undefined") return "dark";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "light" || attr === "dark") return attr;
  return "dark";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => readInitialTheme());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {}
  }, [theme]);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return { theme: "dark" as ThemeMode, setTheme: () => {}, toggleTheme: () => {} };
  }
  return ctx;
}

export const THEME_INIT_SCRIPT = `
(function(){
  try {
    var stored = localStorage.getItem('${STORAGE_KEY}');
    var mode = stored === 'light' || stored === 'dark' ? stored : (
      window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
    );
    document.documentElement.setAttribute('data-theme', mode);
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();
`.trim();
