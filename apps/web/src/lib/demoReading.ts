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

// Randomized once per recording. Floor stays at 20mV/2ppm so it still never
// lands in the flat gray fed_resting zone (see the original rationale below),
// and the ceiling is split ~50/50 across two bands so repeated demo runs show
// genuinely different zones/colors — not just jitter within one narrow band
// split by a zone boundary. (The original flat 20-60mV/2-6ppm range straddled
// the 40mV/4ppm transitional/fat_oxidation line almost exactly, so any run
// landing in "yellow" was mathematically confined to 4.0-6.0ppm — always
// reading as "the same ~5ppm." A wider 4-30ppm high band fixed that but read
// as too erratic/high for a demo — narrowed back down to a believable
// ~2-10ppm overall span while keeping the two-band variety.)
//
// Original rationale for the 2ppm floor: a 1-3ppm range (as used by the
// hardware-fault workaround) straddles the fed_resting/transitional boundary
// (2ppm) almost exactly, so roughly half of all demo sessions peaked *below*
// it and spent the whole 5s in fed_resting's gray/slate zone color — reading
// as a broken gray ring instead of a satisfying colorful one. A demo exists
// purely to show what a good breath test looks like, so it should never land
// in that flat zone.
export function randomDemoParams(): DemoParams {
  const highBand = Math.random() < 0.5;
  const targetMv = highBand
    ? 40 + Math.random() * 60    // 40-100mV = 4-10ppm (fat_oxidation, narrow slice)
    : 20 + Math.random() * 20;   // 20-40mV  = 2-4ppm  (transitional)
  return {
    targetMv,
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
