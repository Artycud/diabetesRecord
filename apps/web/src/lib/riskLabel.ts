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
  | "fed_resting"    // 0.3–2 ppm  : Fed / resting baseline
  | "transitional"   // 2–8 ppm    : Short fast / light exercise / mild carb restriction
  | "fat_oxidation"  // 8–40 ppm   : Active fat oxidation (extended fast / continuous keto)
  | "extended_fast"  // 40–75 ppm  : Extended fasting / strict keto — monitor symptoms
  | "safety_alert"   // ≥ 75 ppm   : Layer 1 ceiling — DKA range, consult doctor
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
  [8,  "transitional"],
  [40, "fat_oxidation"],
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

export const LABEL_TH: Record<string, string> = {
  clean:        "อากาศสะอาด",
  fed_resting:  "พักฟื้น / หลังกิน",
  transitional: "เปลี่ยนผ่าน",
  fat_oxidation:"เผาไขมัน",
  extended_fast:"อดยาว / คีโตเข้ม",
  safety_alert: "⚠️ ควรพบแพทย์",
  unreliable:   "ไม่แน่ใจ",
};

export const LABEL_EN: Record<string, string> = {
  clean:        "Clean air",
  fed_resting:  "Fed / resting",
  transitional: "Transitional",
  fat_oxidation:"Active fat oxidation",
  extended_fast:"Extended fast / strict keto",
  safety_alert: "⚠️ DKA risk — consult doctor",
  unreliable:   "Unreliable",
};

export const LABEL_RANGE: Record<string, string> = {
  fed_resting:  "0.3–2 ppm",
  transitional: "2–8 ppm",
  fat_oxidation:"8–40 ppm",
  extended_fast:"40–75 ppm",
  safety_alert: "≥ 75 ppm",
};

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
    transitional: "ร่างกายกำลังเปลี่ยนผ่าน — อาจเป็นช่วงอดสั้น / ออกกำลังเบา / คาร์บต่ำ",
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
