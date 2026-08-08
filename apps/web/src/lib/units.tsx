"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// Supported display units for breath acetone
//   mV     — raw sensor voltage delta (baseline reference)
//   mmol   — blood-ketone equivalent (mV / 20; matches classifier bands)
//   ppm    — parts-per-million breath acetone (rough TGS1820 approximation)
export type AcetoneUnit = "mV" | "mmol" | "ppm";

// mV → mmol/L: mirrors backend `_BREATH_MV_PER_MMOL = 20.0`
const MV_PER_MMOL = 20.0;
// mV → ppm: linear fit to TGS1820 datasheet Rs/Ro curve at breath-relevant range
//   30 mV boundary ≈ 3 ppm (low→moderate)
//   80 mV boundary ≈ 8 ppm (moderate→high)
// Exported so callers that need to go the other way (e.g. converting the
// Anderson five-class ppm boundaries from GET /ai/thresholds into mV for a
// chart reference line) can reuse the same fixed ratio instead of redefining it.
export const MV_PER_PPM = 10.0;

export function convertFromMv(mv: number, to: AcetoneUnit): number {
  // Concentrations are non-negative in the physical world; small negatives
  // are just sensor drift/noise below the calibrated baseline.
  const clipped = mv < 0 ? 0 : mv;
  switch (to) {
    case "mV":   return clipped;
    case "mmol": return clipped / MV_PER_MMOL;
    case "ppm":  return clipped / MV_PER_PPM;
  }
}

export function unitLabel(u: AcetoneUnit): string {
  return u === "mmol" ? "mmol/L" : u;
}

export function formatAcetone(mv: number | null | undefined, unit: AcetoneUnit): string {
  if (mv == null || Number.isNaN(mv)) return "—";
  const v = convertFromMv(mv, unit);   // already clipped ≥ 0
  if (unit === "mV") return v.toFixed(0);
  return v.toFixed(2);
}

// Convert a threshold that was written in mV into the current unit.
// Used for chart reference lines and range indicators.
export function convertThreshold(mv: number, to: AcetoneUnit): number {
  return convertFromMv(mv, to);
}

type Ctx = {
  unit: AcetoneUnit;
  setUnit: (u: AcetoneUnit) => void;
  format: (mv: number | null | undefined) => string;
  label: string;
};

const UnitCtx = createContext<Ctx | null>(null);

export function UnitsProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnitState] = useState<AcetoneUnit>("mV");

  useEffect(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem("acetoneUnit") : null;
    if (saved === "mV" || saved === "mmol" || saved === "ppm") {
      setUnitState(saved);
    }
  }, []);

  const setUnit = useCallback((u: AcetoneUnit) => {
    setUnitState(u);
    if (typeof localStorage !== "undefined") localStorage.setItem("acetoneUnit", u);
  }, []);

  const value = useMemo<Ctx>(() => ({
    unit,
    setUnit,
    format: (mv) => formatAcetone(mv, unit),
    label: unitLabel(unit),
  }), [unit, setUnit]);

  return <UnitCtx.Provider value={value}>{children}</UnitCtx.Provider>;
}

export function useUnits(): Ctx {
  const ctx = useContext(UnitCtx);
  if (!ctx) throw new Error("useUnits must be used inside <UnitsProvider>");
  return ctx;
}
