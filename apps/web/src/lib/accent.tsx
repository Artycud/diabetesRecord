"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// A second, independent theming axis alongside next-themes' light/dark
// (ThemeProvider.tsx) — accent is "which brand color" (mint, the app's
// original color; cyan, the icy-light redesign; or blue, the #3B82F6 accent
// from the pre-Apple-Health "dark-first Xiaomi Mi Fitness" redesign —
// brought back by request, most recognizable paired with dark mode) rather
// than "how bright the page is". Kept as its own lightweight provider (same
// shape as demoMode.tsx) instead of a second next-themes instance, since
// next-themes is built around one mutually-exclusive attribute swap, not two
// orthogonal ones. Defaults to "mint" so nobody's existing session changes
// look unless they opt in from Appearance settings.
const STORAGE_KEY = "accent";

export type Accent = "mint" | "cyan" | "blue";

type Ctx = {
  accent: Accent;
  setAccent: (v: Accent) => void;
};

const AccentCtx = createContext<Ctx | null>(null);

export function AccentProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<Accent>("mint");

  useEffect(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved === "cyan" || saved === "mint" || saved === "blue") setAccentState(saved);
  }, []);

  // Mirrors what next-themes does internally for data-theme: reflect the
  // current value onto <html> so globals.css's [data-accent="cyan"] rules
  // (which override the same --color-mint-* custom properties every
  // mint-500 utility already reads from) apply app-wide immediately.
  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
  }, [accent]);

  const setAccent = useCallback((v: Accent) => {
    setAccentState(v);
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, v);
  }, []);

  const value = useMemo<Ctx>(() => ({ accent, setAccent }), [accent, setAccent]);

  return <AccentCtx.Provider value={value}>{children}</AccentCtx.Provider>;
}

export function useAccent(): Ctx {
  const ctx = useContext(AccentCtx);
  if (!ctx) throw new Error("useAccent must be used inside <AccentProvider>");
  return ctx;
}
