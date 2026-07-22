"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Hidden, per-browser toggle (apps/web/src/app/(app)/me/page.tsx) that lets
// any user run a full breath-test session with no physical device at all —
// see apps/web/src/lib/demoReading.ts for the synthetic curve, and
// BreathSession.tsx's `isDemo` prop for how it's consumed.
const STORAGE_KEY = "demoMode";

type Ctx = {
  demoMode: boolean;
  setDemoMode: (v: boolean) => void;
};

const DemoModeCtx = createContext<Ctx | null>(null);

export function DemoModeProvider({ children }: { children: React.ReactNode }) {
  const [demoMode, setDemoModeState] = useState(false);

  useEffect(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (saved === "true") setDemoModeState(true);
  }, []);

  const setDemoMode = useCallback((v: boolean) => {
    setDemoModeState(v);
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, String(v));
  }, []);

  const value = useMemo<Ctx>(() => ({ demoMode, setDemoMode }), [demoMode, setDemoMode]);

  return <DemoModeCtx.Provider value={value}>{children}</DemoModeCtx.Provider>;
}

export function useDemoMode(): Ctx {
  const ctx = useContext(DemoModeCtx);
  if (!ctx) throw new Error("useDemoMode must be used inside <DemoModeProvider>");
  return ctx;
}
