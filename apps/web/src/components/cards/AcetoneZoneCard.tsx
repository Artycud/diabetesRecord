"use client";

import { useEffect, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import { convertFromMv } from "@/lib/units";

// ─── Zone data ──────────────────────────────────────────────────────────────

type ZoneDetail = {
  heading: string;
  body: string;
};

type Zone = {
  n: 1 | 2 | 3 | 4 | 5;
  name: string;
  rangeText: string;
  lo: number;   // ppm — inclusive
  hi: number;   // ppm — exclusive (Infinity for last)
  desc: string;
  color: string;
  details: ZoneDetail[];
};

const ZONES: Zone[] = [
  {
    n: 1,
    name: "Rest Zone",
    rangeText: "0.5–2 ppm",
    lo: 0,
    hi: 2,
    desc: "ร่างกายกำลังใช้พลังงานจากอาหารมื้อล่าสุด",
    color: "#6C9BFF",
    details: [
      {
        heading: "ตอนนี้ร่างกายเป็นยังไง",
        body:
          "ยังไม่เห็นสัญญาณการเผาผลาญไขมันชัดเจน เป็นระดับปกติของคนทั่วไปที่กินอาหารตามปกติ",
      },
      {
        heading: "มักเจอตอนไหน",
        body:
          "หลังกินอาหารเสร็จใหม่ ๆ — ร่างกายกำลังใช้พลังงานจากมื้อที่เพิ่งกินเข้าไป " +
          "แทนที่จะไปดึงไขมันที่สะสมไว้",
      },
      {
        heading: "แปลว่าอะไร",
        body:
          "ไม่ได้แปลว่าอะไรผิดปกติเลย เป็นเรื่องธรรมชาติหลังมื้ออาหาร " +
          "ถ้าค่าขึ้น ๆ ลง ๆ ตามมื้ออาหารและกิจกรรมประจำวัน แสดงว่าระบบเผาผลาญของคุณตอบสนองได้ดี",
      },
      {
        heading: "ก้าวถัดไป",
        body:
          "อยากเห็นค่าไต่ขึ้นโซนถัดไป? ลองเว้นมื้ออาหารสัก 4–6 ชั่วโมง " +
          "หรือเดินเบา ๆ หลังกินก็ช่วยได้เยอะเลย",
      },
    ],
  },
  {
    n: 2,
    name: "Fat-Burn Zone",
    rangeText: "2–4 ppm",
    lo: 2,
    hi: 4,
    desc: "เยี่ยม! ร่างกายเริ่มดึงไขมันสะสมมาใช้เป็นพลังงานแล้ว",
    color: "#7BC97C",
    details: [
      {
        heading: "ตอนนี้ร่างกายเป็นยังไง",
        body:
          "ร่างกายกำลังปรับตัวเมื่อพลังงานจากคาร์บลดลง และเริ่มดึงไขมันสะสมออกมาใช้แล้ว " +
          "เป็นสัญญาณดีของการลดน้ำหนัก",
      },
      {
        heading: "มักเจอตอนไหน",
        body:
          "หลังตื่นนอนใหม่ ๆ, ช่วงระหว่างมื้อ, หรือหลังออกกำลังกาย " +
          "มักเห็นในคนที่คุมแคลอรี่หรือขยับตัวสม่ำเสมอ",
      },
      {
        heading: "แปลว่าอะไร",
        body:
          "ระบบเผาผลาญของคุณยืดหยุ่นได้ดี — สลับจากเผาน้ำตาลไปเผาไขมันได้ตามธรรมชาติ " +
          "ถ้าเป้าหมายคุณคือลดน้ำหนัก โซนนี้คือสัญญาณที่คุณกำลังมาถูกทาง",
      },
      {
        heading: "ก้าวถัดไป",
        body:
          "คงจังหวะนี้ต่อไปได้เลย ลองเพิ่มการขยับตัวเบา ๆ หรือกินคาร์บน้อยลงในมื้อถัดไป " +
          "ช่วยให้ค่าไต่ขึ้นโซน 3 ได้เร็วขึ้น",
      },
    ],
  },
  {
    n: 3,
    name: "Deep Burn Zone",
    rangeText: "4–30 ppm",
    lo: 4,
    hi: 30,
    desc: "ร่างกายอยู่ในโหมดเผาผลาญไขมันเต็มที่",
    color: "#E0A63C",
    details: [
      {
        heading: "ตอนนี้ร่างกายเป็นยังไง",
        body:
          "ร่างกายปรับมาใช้ไขมันสะสมเป็นแหล่งพลังงานหลักแล้ว " +
          "เผาผลาญไขมันได้ต่อเนื่อง ส่งผลให้ลดน้ำหนักได้ดี",
      },
      {
        heading: "มักเจอตอนไหน",
        body:
          "พบได้บ่อยในคนที่ทำคีโตไดเอทต่อเนื่อง, อดอาหารเป็นช่วง (IF) นานหน่อย, " +
          "หรือออกกำลังกายต่อเนื่องเป็นระยะ",
      },
      {
        heading: "แปลว่าอะไร",
        body:
          "ลองสังเกตว่าเมื่อกลับมากินคาร์บ ค่านี้ลดลงกลับมาที่ Zone 1–2 ได้เร็วแค่ไหน " +
          "ยิ่งลดเร็ว ยิ่งบ่งบอกถึงความยืดหยุ่นของระบบเผาผลาญที่ดี",
      },
      {
        heading: "ก้าวถัดไป",
        body:
          "อยู่โซนนี้ควรดื่มน้ำมากขึ้นและเสริมเกลือแร่ให้พอ " +
          "ถ้ารู้สึกดี ไม่หิวจัด สมองใส แปลว่าร่างกายปรับตัวได้ลงตัวแล้ว",
      },
    ],
  },
  {
    n: 4,
    name: "Peak Zone",
    rangeText: "30–75 ppm",
    lo: 30,
    hi: 75,
    desc: "ร่างกายอยู่ในภาวะเผาผลาญไขมันระดับสูง",
    color: "#E27245",
    details: [
      {
        heading: "ตอนนี้ร่างกายเป็นยังไง",
        body:
          "ร่างกายเผาไขมันในระดับสูงมาก มักเกิดจากการอดอาหารต่อเนื่องเป็นเวลานาน " +
          "หรือคีโตไดเอทแบบเข้มงวด",
      },
      {
        heading: "มักเจอตอนไหน",
        body:
          "ช่วงอดอาหารยาว (มากกว่า 24 ชั่วโมง), คีโตแบบเคร่งมาก ๆ, " +
          "หรือช่วงที่ออกกำลังกายหนักและกินน้อยพร้อมกัน",
      },
      {
        heading: "แปลว่าอะไร",
        body:
          "ถ้าคุณตั้งใจอยู่โซนนี้ก็ไม่เป็นไร แต่ควรดื่มน้ำให้เพียงพอและสังเกตร่างกายตัวเอง " +
          "ถ้าเห็นค่านี้บ่อย ๆ ทั้งที่ไม่ได้ตั้งใจงดมื้อไหน หรือไม่ได้กินคีโต ลองสังเกตตัวเองสักหน่อยนะ",
      },
      {
        heading: "ก้าวถัดไป",
        body:
          "ลองเช็กดูว่าช่วงนี้กินอาหารครบมื้อไหม พักผ่อนพอไหม " +
          "และถ้ามีโอกาสไปตรวจเช็คสุขภาพประจำปีบ้างก็ดีเหมือนกัน",
      },
    ],
  },
  {
    n: 5,
    name: "Caution Zone",
    rangeText: "มากกว่า 75 ppm",
    lo: 75,
    hi: Infinity,
    desc: "ค่าที่วัดได้สูงผิดปกติ — ควรปรึกษาแพทย์",
    color: "#D97B7B",
    details: [
      {
        heading: "ตอนนี้ร่างกายเป็นยังไง",
        body:
          "ค่าขึ้นสูงกว่าปกติมาก ควรใส่ใจตัวเองเป็นพิเศษ โดยเฉพาะถ้าคุณเป็นเบาหวานอยู่แล้ว",
      },
      {
        heading: "อาการที่ควรเช็ก",
        body:
          "กระหายน้ำมากผิดปกติ, เวียนหัว, คลื่นไส้, อ่อนเพลีย, " +
          "หายใจหอบลึก หรือรู้สึกไม่สบายตัวชัดเจน",
      },
      {
        heading: "แปลว่าอะไร",
        body:
          "ค่านี้อาจสัมพันธ์กับภาวะ DKA (เลือดเป็นกรดในผู้ป่วยเบาหวาน) " +
          "ซึ่งเป็นเรื่องเร่งด่วนทางการแพทย์ ไม่ควรรอดูอาการเอง",
      },
      {
        heading: "ก้าวถัดไป",
        body:
          "ถ้ามีอาการข้างต้นร่วมด้วย หรือคุณเป็นเบาหวาน แนะนำให้รีบปรึกษาแพทย์ทันที " +
          "ถ้าไม่มีอาการอะไรเลย ลองวัดใหม่ในที่อากาศดี ๆ หลังพักสักครู่",
      },
    ],
  },
];

function zoneOf(ppm: number): Zone {
  return ZONES.find((z) => ppm >= z.lo && ppm < z.hi) ?? ZONES[ZONES.length - 1];
}

/** Position of the current value on the gradient bar (0..1).
 *  Each zone occupies 1/N of the bar; within a zone the position is proportional
 *  to how far the value has advanced from its `lo` to `hi`. Values above the last
 *  finite `hi` are clamped to the right edge. */
function markerPosition(ppm: number): number {
  const n = ZONES.length;
  const idx = ZONES.findIndex((z) => ppm >= z.lo && ppm < z.hi);
  if (idx === -1) return 1;
  const z = ZONES[idx];
  const span = Number.isFinite(z.hi) ? z.hi - z.lo : Math.max(20, z.lo * 0.2);
  const frac = Math.min(1, Math.max(0, (ppm - z.lo) / span));
  return (idx + frac) / n;
}

// ─── Modal ──────────────────────────────────────────────────────────────────

function ZoneDetailModal({ zone, onClose }: { zone: Zone; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md bg-bg-surface rounded-t-3xl sm:rounded-3xl pb-8 px-5 pt-5 max-h-[85vh] flex flex-col">
        <div className="w-10 h-1 bg-border-subtle rounded-full mx-auto mb-4 sm:hidden shrink-0" />

        <div className="flex items-start justify-between mb-4 shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="h-4 w-4 rounded-full shrink-0"
              style={{ background: zone.color, boxShadow: `0 0 0 4px ${zone.color}22` }}
            />
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-widest" style={{ color: zone.color }}>
                Zone {zone.n}
              </p>
              <h2 className="text-lg font-semibold text-text-primary leading-tight truncate">
                {zone.name}
              </h2>
              <p className="text-xs text-text-muted mt-0.5 font-mono">{zone.rangeText}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 -mr-1.5 rounded-xl text-text-muted hover:text-text-primary transition-colors shrink-0"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 space-y-4 pr-1">
          {zone.details.map((d) => (
            <div key={d.heading}>
              <p
                className="text-[11px] font-semibold uppercase tracking-widest mb-1.5"
                style={{ color: zone.color }}
              >
                {d.heading}
              </p>
              <p className="text-sm text-text-primary leading-relaxed">{d.body}</p>
            </div>
          ))}

          <div className="bg-bg-elevated rounded-xl p-3 text-xs text-text-muted leading-relaxed">
            เนื้อหานี้เป็นข้อมูลเชิงสุขภาพทั่วไป ไม่ใช่คำแนะนำทางการแพทย์ —
            หากมีข้อสงสัยเกี่ยวกับสุขภาพเฉพาะบุคคล ควรปรึกษาแพทย์
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Card ───────────────────────────────────────────────────────────────────

interface Props {
  currentMv: number | null;
  live?: boolean;
}

export function AcetoneZoneCard({ currentMv, live = false }: Props) {
  const ppm = currentMv != null ? convertFromMv(currentMv, "ppm") : null;
  const activeZone = ppm != null ? zoneOf(ppm) : null;
  const markerPct = ppm != null ? markerPosition(ppm) * 100 : null;

  // Accordion: one expanded row at a time. Default to the active zone.
  const [expandedZoneN, setExpandedZoneN] = useState<number | null>(activeZone?.n ?? null);
  useEffect(() => {
    // When the active zone shifts (e.g. new reading arrives), auto-expand it.
    if (activeZone?.n) setExpandedZoneN(activeZone.n);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeZone?.n]);

  const [modalZone, setModalZone] = useState<Zone | null>(null);

  // Rainbow gradient built from zone colors, one stop per zone (5 equal segments).
  const gradient = `linear-gradient(90deg, ${ZONES.map(
    (z, i) => `${z.color} ${(i / ZONES.length) * 100}%, ${z.color} ${((i + 1) / ZONES.length) * 100}%`,
  ).join(", ")})`;

  return (
    <>
      <div className="bg-bg-elevated rounded-2xl p-4 space-y-4">
        {/* Slight brand mark — same quiet eyebrow-label convention Home
            already uses (text-mint-500, uppercase, tracking-widest), not a
            new style, just enough presence to say "this is MetaBreath's
            reading" without competing with the number below it. */}
        <p className="text-[10px] text-mint-500 font-semibold uppercase tracking-widest">MetaBreath</p>

        {/* Header: current value + active zone label */}
        <div className="flex items-baseline justify-between gap-3">
          {ppm != null && activeZone ? (
            <>
              <div className="flex items-baseline gap-1.5">
                <span className="stat-mono text-3xl text-text-primary">{ppm.toFixed(2)}</span>
                <span className="text-sm text-text-muted">ppm</span>
                {live && (
                  <span className="ml-1 inline-flex items-center gap-1 text-[10px] text-mint-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-mint-500 animate-pulse" />
                    LIVE
                  </span>
                )}
              </div>
              <span className="text-sm font-medium" style={{ color: activeZone.color }}>
                Zone {activeZone.n} · {activeZone.name}
              </span>
            </>
          ) : (
            <>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-text-disabled">—</span>
                <span className="text-sm text-text-muted">ppm</span>
              </div>
              <span className="text-xs text-text-muted">ยังไม่มีข้อมูล</span>
            </>
          )}
        </div>

        {/* Gradient bar with marker */}
        <div className="relative h-2.5 rounded-full overflow-visible" style={{ background: gradient }}>
          {markerPct != null && activeZone && (
            <>
              {/* Blurred glow behind the marker, in the active zone's own
                  color (not riskLabel.ts's LABEL_STYLE — this card's ZONES
                  palette is independent, so the glow must match the
                  gradient bar it sits on). Reuses the same 4s breathing
                  rhythm as FloatingHero's ambient halo, not a new keyframe. */}
              <div
                className="absolute rounded-full blur-md pointer-events-none animate-halo-breathe"
                style={{
                  left: `calc(${markerPct}% - 18px)`,
                  top: "-0.5625rem",
                  height: "2.25rem",
                  width: "2.25rem",
                  backgroundColor: activeZone.color,
                  opacity: 0.4,
                }}
                aria-hidden="true"
              />
              <div
                className="absolute -top-1 h-4.5 w-4.5 rounded-full bg-bg-elevated border-2 border-text-primary shadow-md pointer-events-none"
                style={{ left: `calc(${markerPct}% - 9px)`, height: "1.125rem", width: "1.125rem" }}
                aria-hidden="true"
              />
            </>
          )}
        </div>

        {/* Zone rows — single-line, accordion expand */}
        <div className="divide-y divide-border-subtle">
          {ZONES.map((z) => {
            const isExpanded = expandedZoneN === z.n;
            const isActive = activeZone?.n === z.n;
            return (
              <div key={z.n}>
                <button
                  type="button"
                  onClick={() => setExpandedZoneN(isExpanded ? null : z.n)}
                  aria-expanded={isExpanded}
                  className="w-full flex items-center gap-2.5 py-3 text-left hover:bg-bg-raised/40 rounded-lg px-1 -mx-1 transition-colors"
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{
                      background: z.color,
                      boxShadow: isActive ? `0 0 0 3px ${z.color}33` : "none",
                    }}
                  />
                  <p
                    className={`text-sm ${isActive ? "font-semibold text-text-primary" : "font-medium text-text-primary/90"}`}
                  >
                    {z.name}
                  </p>
                  <span className="ml-auto text-xs text-text-muted font-mono">{z.rangeText}</span>
                  <ChevronDown
                    size={16}
                    className={`text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  />
                </button>

                {isExpanded && (
                  <div className="pb-3 pl-5 pr-1 space-y-2">
                    <p className="text-xs text-text-muted leading-relaxed">{z.desc}</p>
                    <button
                      type="button"
                      onClick={() => setModalZone(z)}
                      className="text-xs font-semibold underline underline-offset-2 hover:opacity-80 transition-opacity"
                      style={{ color: z.color }}
                    >
                      ดูรายละเอียด →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {modalZone && <ZoneDetailModal zone={modalZone} onClose={() => setModalZone(null)} />}
    </>
  );
}
