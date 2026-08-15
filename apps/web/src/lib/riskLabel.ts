/**
 * MetaBreath — Metabolic Flexibility Label System
 *
 * 3-layer architecture:
 *   Layer 1 — Safety ceiling   : safety_alert ≥75 ppm (hard rule, always warn)
 *   Layer 2 — Contextual zones : 4 zones, describe state — never judge good/bad
 *   Layer 3 — Flexibility Score: 0–100, computed by flexibility_engine
 *
 * Source: Anderson JC. Obesity (2015) 23:2327-2334 · Wei et al. 2024
 */

export type MetabolicZone =
  | "fed_resting"    // 0.5–2 ppm  : Rest Zone — fed / resting baseline
  | "transitional"   // 2–4 ppm    : light_ketosis per Anderson (2015)
  | "fat_oxidation"  // 4–30 ppm   : Deep Burn Zone — active fat oxidation / keto
  | "extended_fast"  // 30–75 ppm  : Peak Zone — extended fast / strict keto
  | "safety_alert"   // ≥ 75 ppm   : Caution Zone — DKA range, consult doctor
  | "clean"          // ambient air
  | "unreliable";    // low quality / sensor issue

/** Back-compat alias */
export type AcetoneLabel = MetabolicZone;

/**
 * Map backend labels → 4-zone frontend MetabolicZone.
 *
 * Two backend label vocabularies exist and both are mapped here:
 *   - Anderson 2015 five-class: basal|light_ketosis|nutritional_ketosis|deep_ketosis|dka_risk
 *   - app.services.signal_processing.classify_acetone (what the API/MQTT
 *     pipeline actually sends today, confirmed against production logs):
 *     clean|low|moderate|high|unreliable, at 5/30/80 mV boundaries. These
 *     were previously NOT in this map at all, so every real reading labeled
 *     low/moderate/high silently fell through to "unreliable" — fixed below.
 *     Mapped conservatively (never escalates into safety_alert territory,
 *     which starts at 75ppm/750mV — far above classify_acetone's 80mV "high"
 *     floor) to match classify_acetone's own documented intent:
 *       low      (5-30mV)  "no significant acetone"   → fed_resting
 *       moderate (30-80mV) "mild ketosis / fat burning" → transitional
 *       high     (>=80mV)  "strong ketosis"            → fat_oxidation
 * Frontend shows: fed_resting|transitional|fat_oxidation|extended_fast|safety_alert
 */
export function backendLabelToZone(label: string | null | undefined): MetabolicZone {
  const map: Record<string, MetabolicZone> = {
    basal:                "fed_resting",
    light_ketosis:        "transitional",
    nutritional_ketosis:  "fat_oxidation",
    deep_ketosis:         "extended_fast",
    dka_risk:             "safety_alert",
    // app.services.signal_processing.classify_acetone's actual vocabulary
    low:                  "fed_resting",
    moderate:             "transitional",
    high:                 "fat_oxidation",
    // pass-through if already 4-zone
    fed_resting:          "fed_resting",
    transitional:         "transitional",
    fat_oxidation:        "fat_oxidation",
    extended_fast:        "extended_fast",
    safety_alert:         "safety_alert",
    clean:                "clean",
    unreliable:           "unreliable",
  };
  return map[label ?? ""] ?? "unreliable";
}

/** Zone thresholds in ppm (acetone_delta) */
export const ZONE_THRESHOLDS: [number, MetabolicZone][] = [
  [2,  "fed_resting"],
  [4,  "transitional"],
  [30, "fat_oxidation"],
  [75, "extended_fast"],
];

/** Determine zone from acetone ppm reading */
export function metabolicZone(ppm: number | null | undefined): MetabolicZone {
  if (ppm == null || ppm < 0) return "unreliable";
  for (const [thresh, zone] of ZONE_THRESHOLDS) {
    if (ppm < thresh) return zone;
  }
  return "safety_alert";
}

// [0, 2, 4, 30, 75, Infinity] — 5 zone edges derived from ZONE_THRESHOLDS,
// the single source of truth for boundaries (not a second copy like
// AcetoneZoneCard.tsx's own bespoke ZONES array, which exists only for
// that screen's accordion/modal content).
const ZONE_EDGES = [0, ...ZONE_THRESHOLDS.map(([t]) => t), Infinity];

/** Position of a ppm value across the whole 5-zone scale (0..1), for a
 *  radial/linear gauge fill — proportional *within* the current zone
 *  rather than a flat value/max mapping, so a gauge built on this tracks
 *  the actual zone boundaries instead of drifting out of sync with them. */
export function zoneProgress(ppm: number | null | undefined): number {
  if (ppm == null || ppm < 0) return 0;
  const n = ZONE_EDGES.length - 1;
  for (let i = 0; i < n; i++) {
    const lo = ZONE_EDGES[i];
    const hi = ZONE_EDGES[i + 1];
    if (ppm < hi || i === n - 1) {
      const span = Number.isFinite(hi) ? hi - lo : Math.max(20, lo * 0.2);
      const frac = Math.min(1, Math.max(0, (ppm - lo) / span));
      return (i + frac) / n;
    }
  }
  return 1;
}

interface LabelStyle {
  color: string;
  grad: [string, string];
  tailwind: string;
}

/** Visual style per zone — neutral palette, not "good = green / bad = red" */
export const LABEL_STYLE: Record<string, LabelStyle> = {
  clean:        { color: "#38BDF8", grad: ["#38BDF8", "#7DD3FC"], tailwind: "text-sky-400" },
  fed_resting:  { color: "#94A3B8", grad: ["#94A3B8", "#CBD5E1"], tailwind: "text-slate-400" },
  transitional: { color: "#34D399", grad: ["#34D399", "#6EE7B7"], tailwind: "text-emerald-400" },
  fat_oxidation:{ color: "#FBBF24", grad: ["#FBBF24", "#FDE68A"], tailwind: "text-amber-400" },
  extended_fast:{ color: "#F97316", grad: ["#F97316", "#FDBA74"], tailwind: "text-orange-400" },
  safety_alert: { color: "#EF4444", grad: ["#EF4444", "#F87171"], tailwind: "text-red-400" },
  unreliable:   { color: "#6B7280", grad: ["#4A4A4A", "#7A7A7A"], tailwind: "text-text-muted" },
};

// Zone-boundary colors as an ordered ramp (ppm -> color), reusing
// LABEL_STYLE's own base colors so this never drifts out of sync with the
// zone palette. Distinct from LABEL_STYLE's per-zone lookup, which is a
// discrete jump at each threshold — fine for static labels/badges, but
// visibly "cuts" when applied to a value that's continuously rising (e.g.
// live during a breath test): crossing 2ppm would instantly snap slate to
// emerald instead of easing through it.
const COLOR_RAMP: [number, string][] = [
  [0,  LABEL_STYLE.fed_resting.color],
  [2,  LABEL_STYLE.transitional.color],
  [4,  LABEL_STYLE.fat_oxidation.color],
  [30, LABEL_STYLE.extended_fast.color],
  [75, LABEL_STYLE.safety_alert.color],
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");
}

/** Continuously interpolated color for a live ppm value — smoothly blends
 *  between adjacent zone-boundary colors instead of snapping at thresholds
 *  the way LABEL_STYLE's discrete lookup does. Intended for anything
 *  tracking a value in real time (e.g. the breathing recording vessel's
 *  fill color), not for static zone badges/labels. */
export function rampColor(ppm: number): string {
  const v = Number.isFinite(ppm) ? Math.max(0, ppm) : 0;
  if (v <= COLOR_RAMP[0][0]) return COLOR_RAMP[0][1];
  for (let i = 1; i < COLOR_RAMP.length; i++) {
    const [hi, hiColor] = COLOR_RAMP[i];
    const [lo, loColor] = COLOR_RAMP[i - 1];
    if (v <= hi) {
      const t = (v - lo) / (hi - lo);
      const a = hexToRgb(loColor);
      const b = hexToRgb(hiColor);
      return rgbToHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return COLOR_RAMP[COLOR_RAMP.length - 1][1];
}

// Zone NAMES are shared, language-agnostic terms — kept in English even in
// the Thai UI, exactly matching the established naming already used by
// AcetoneZoneCard.tsx's own 5-zone ladder (Rest/Fat-Burn/Deep Burn/Peak/
// Caution Zone). Having two different names for the same zone across
// different cards (this file previously had "Transitional"/"เปลี่ยนผ่าน",
// then briefly "Light ketosis"/"คีโตอ่อน") reads as inconsistent — one
// vocabulary for zone names app-wide, not a competing one per screen.
export const LABEL_TH: Record<string, string> = {
  clean:        "อากาศสะอาด",
  fed_resting:  "Rest Zone",
  transitional: "Fat-Burn Zone",
  fat_oxidation:"Deep Burn Zone",
  extended_fast:"Peak Zone",
  safety_alert: "Caution Zone",
  unreliable:   "ไม่แน่ใจ",
};

export const LABEL_EN: Record<string, string> = {
  clean:        "Clean air",
  fed_resting:  "Rest Zone",
  transitional: "Fat-Burn Zone",
  fat_oxidation:"Deep Burn Zone",
  extended_fast:"Peak Zone",
  safety_alert: "Caution Zone",
  unreliable:   "Unreliable",
};

export const LABEL_RANGE: Record<string, string> = {
  fed_resting:  "0.5–2 ppm",
  transitional: "2–4 ppm",
  fat_oxidation:"4–30 ppm",
  extended_fast:"30–75 ppm",
  safety_alert: "≥ 75 ppm",
};

// These boundaries are sourced from published literature (Anderson JC,
// Obesity 2015), not from this device's own concentration-response
// calibration — the in-app "Calibrate" flow only records a single-point
// ambient-zero baseline (a drift/offset reset), not a curve validated
// against known ppm concentrations. Surfaced in the UI wherever these
// ranges are shown so their decimal-looking precision doesn't read as
// device-measured when it isn't — matches `anderson_reference`, the same
// citation the backend already returns from GET /ai/thresholds.
export const RANGE_REFERENCE_TH =
  "ช่วงตัวเลขอ้างอิงจากงานวิจัย (Anderson, 2015) ไม่ใช่ค่าที่ผ่านการสอบเทียบเฉพาะอุปกรณ์นี้โดยตรง";
export const RANGE_REFERENCE_EN =
  "Ranges are reference values from published research (Anderson, 2015), not this device's own calibrated measurements.";

/** Non-judgmental context message shown below the zone — differs by session context */
export function zoneContextMessage(
  zone: MetabolicZone,
  contextTag?: string | null,
  fastingHours?: number | null,
): string {
  if (zone === "safety_alert")
    return "ค่าอยู่ในช่วง DKA — กรุณาปรึกษาแพทย์หรือตรวจสอบอาการทันที";

  if (contextTag === "fasting" && fastingHours && fastingHours >= 8) {
    if (zone === "fed_resting")
      return `อดมาแล้ว ${fastingHours} ชม. แต่ค่ายังต่ำ — ลองสังเกตว่านอนพอหรือมื้อก่อนนอนมีคาร์บสูงไหม`;
    if (zone === "transitional")
      return `ร่างกายเริ่มสลับมาใช้ไขมันหลังอด ${fastingHours} ชม.`;
    if (zone === "fat_oxidation")
      return `ระบบเผาผลาญตอบสนองดี — ค่าขึ้นสอดคล้องกับการอด ${fastingHours} ชม.`;
  }

  if (contextTag === "post_meal") {
    if (zone === "fed_resting") return "ค่ากลับสู่ระดับพักฟื้นหลังกิน — ร่างกายตอบสนองได้ดี";
    if (zone === "transitional") return "ค่ายังไม่กลับต่ำสุด — อาจต้องอีกสักครู่";
    if (zone === "fat_oxidation" || zone === "extended_fast")
      return "ค่าสูงกว่าที่คาดหลังกิน — ลองสังเกตว่าคาร์บในมื้อนี้มากน้อยแค่ไหน";
  }

  if (contextTag === "post_exercise") {
    if (zone === "transitional" || zone === "fat_oxidation")
      return "การออกกำลังกายกระตุ้นการเผาผลาญไขมัน — ค่าสอดคล้องกับที่คาดไว้";
  }

  const defaults: Record<string, string> = {
    fed_resting:  "ร่างกายอยู่ในโหมดพักฟื้น — ค่าปกติสำหรับคนที่เพิ่งกินหรืออดไม่นาน",
    transitional: "ร่างกายเริ่มดึงไขมันสะสมมาใช้เป็นพลังงาน — อาจเป็นช่วงอดสั้น / ออกกำลังเบา / คาร์บต่ำ",
    fat_oxidation:"ร่างกายเผาผลาญไขมันอยู่ — สอดคล้องกับอด / คีโต / ออกกำลังกาย",
    extended_fast:"ค่าสูง — ถ้ารู้สึกปกติดีก็ไม่เป็นไร แต่ควรดื่มน้ำและสังเกตอาการ",
    unreliable:   "คุณภาพสัญญาณต่ำ — ลองวัดใหม่อีกครั้ง",
  };
  return defaults[zone] ?? "";
}

/** Flexibility Score color + label */
export function flexScoreStyle(score: number): { color: string; label: string; tailwind: string } {
  if (score >= 70) return { color: "#00C896", label: "ยืดหยุ่นดี",   tailwind: "text-emerald-400" };
  if (score >= 40) return { color: "#F97316", label: "พอใช้",         tailwind: "text-orange-400" };
  return             { color: "#EF4444", label: "ต้องพัฒนา",    tailwind: "text-red-400" };
}
