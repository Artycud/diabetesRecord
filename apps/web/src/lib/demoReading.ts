// Pure synthetic acetone/pressure curve for Demo Mode (see demoMode.tsx).
// No real signal exists in this path at all (no device), so unlike the
// pressure-driven hardware-fault workaround (apps/api/app/services/
// acetone_simulator.py), this is purely a function of elapsed time within
// the 5s recording window — no timers/state of its own, driven by
// BreathSession's existing per-frame `progress` value.

export interface DemoParams {
  targetMv: number;
  targetKpa: number;
}

// Randomized once per recording. Deliberately lands solidly inside the
// transitional/fat_oxidation zones (2-6ppm, 20-60mV) rather than the
// 1-3ppm range used for the hardware-fault workaround: that range straddles
// the fed_resting/transitional boundary (2ppm) almost exactly, so roughly
// half of all demo sessions peaked *below* it and spent the whole 5s in
// fed_resting's gray/slate zone color — reading as a broken gray ring
// instead of a satisfying colorful one. A demo exists purely to show what
// a good breath test looks like, so it should never land in that flat zone.
export function randomDemoParams(): DemoParams {
  return {
    targetMv: 20 + Math.random() * 40,
    targetKpa: 4 + Math.random() * 4,
  };
}

// progress: 0-100 within the current 5s recording window.
export function demoValueAt(progress: number, params: DemoParams): { mv: number; kpa: number } {
  const t = Math.min(100, Math.max(0, progress));
  // Rise over the first 60% of the window, then ease down slightly near the
  // end — mimics a real gas-sensor response shape without any real input.
  const frac = t < 60 ? t / 60 : 1 - ((t - 60) / 40) * 0.15;
  const jitter = (Math.random() - 0.5) * 2;
  return {
    mv: Math.max(0, params.targetMv * frac + jitter),
    kpa: Math.max(0, params.targetKpa * frac + jitter * 0.3),
  };
}
