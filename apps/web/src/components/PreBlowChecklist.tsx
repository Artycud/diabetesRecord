"use client";

import { useState } from "react";
import { X, ChevronRight, ChevronLeft, ClipboardCheck } from "lucide-react";
import Image from "next/image";

// ─── Question schema ────────────────────────────────────────────────────────
type QuestionKind = "single" | "multi" | "info" | "urine_color";

interface Question {
  id: string;
  kind: QuestionKind;
  title: string;
  options?: string[];
  imageSrc?: string;
  imageAlt?: string;
  note?: string;
}

// URS-1K color scale — mirrors URINE_BANDS in app/(app)/log/page.tsx and
// signal_processing.URINE_KETONE_SCALE on the backend.
const URINE_BANDS = [
  { category: "negative", label: "Neg",      mmol: 0.0, color: "#EEE6BE", text: "#4A4023" },
  { category: "trace",    label: "Trace",    mmol: 0.5, color: "#EBC7C0", text: "#4A2426" },
  { category: "small",    label: "Small",    mmol: 1.5, color: "#D48EA5", text: "#FFFFFF" },
  { category: "moderate", label: "Moderate", mmol: 4.0, color: "#9F507A", text: "#FFFFFF" },
  { category: "large",    label: "Large",    mmol: 8.0, color: "#5A2C55", text: "#FFFFFF" },
] as const;

const QUESTIONS: Question[] = [
  {
    id: "last_meal_time",
    kind: "single",
    title: "ช่วงเวลาที่กินอาหารมื้อล่าสุด",
    options: [
      "12.00–15.00 น. ของเมื่อวาน",
      "16.00–19.00 น. ของเมื่อวาน",
      "20.00–22.00 น. ของเมื่อวาน",
      "หลัง 22.00 น. ของเมื่อวาน",
      "กินอาหารเช้าวันนี้มาแล้ว",
    ],
  },
  {
    id: "last_meal_type",
    kind: "multi",
    title: "ลักษณะอาหารมื้อล่าสุด (เลือกได้หลายข้อ)",
    options: [
      "คาร์โบไฮเดรตสูง (ข้าว/แป้ง/น้ำตาล)",
      "ไขมันสูง",
      "โปรตีนสูง",
      "ผักผลไม้เป็นหลัก",
      "อาหารคีโตหรือคาร์บต่ำมาก",
    ],
  },
  {
    id: "alcohol_24h",
    kind: "single",
    title: "ดื่มแอลกอฮอล์ใน 24 ชั่วโมงที่ผ่านมาหรือไม่",
    options: ["ใช่", "ไม่ใช่"],
  },
  {
    id: "sleep_hours",
    kind: "single",
    title: "ชั่วโมงการนอนคืนที่ผ่านมา",
    options: [
      "น้อยกว่า 6 ชั่วโมง",
      "ประมาณ 6 ชั่วโมง",
      "ประมาณ 7 ชั่วโมง",
      "ประมาณ 8 ชั่วโมง",
    ],
  },
  {
    id: "exercise_intensity_24h",
    kind: "single",
    title: "ระดับความหนักของการออกกำลังกายใน 24 ชั่วโมงที่ผ่านมา",
    options: ["เบา", "ปานกลาง", "หนัก", "ไม่ได้ออกกำลังกาย"],
  },
  {
    id: "stress_today",
    kind: "single",
    title: "ระดับความเครียดวันนี้",
    options: [
      "ไม่เครียดเลย",
      "เครียดนิดหน่อย",
      "เครียดปานกลาง",
      "เครียดมาก",
      "เครียดที่สุด",
    ],
  },
  {
    id: "medication",
    kind: "single",
    title:
      "กำลังใช้ยาที่อาจมีผลต่อเมตาบอลิซึมหรือไม่ (เช่น ยาเบาหวาน, ยาลดไขมัน, อินซูลิน, สเตียรอยด์, ยาหรือฮอร์โมนไทรอยด์)",
    options: ["ใช้", "ไม่ได้ใช้"],
  },
  {
    id: "smoke_2h",
    kind: "single",
    title: "สูบบุหรี่/บุหรี่ไฟฟ้าใน 2 ชั่วโมงก่อนวัดหรือไม่",
    options: ["ใช่", "ไม่ใช่"],
  },
  {
    id: "brush_30m",
    kind: "single",
    title: "แปรงฟัน/ใช้น้ำยาบ้วนปากใน 30 นาทีก่อนวัดหรือไม่",
    options: ["ใช่", "ไม่ใช่"],
  },
  {
    id: "urs1k_guide",
    kind: "urine_color",
    title: "คู่มือการใช้งานและอ่านค่าแผ่นสีตรวจคีโต URS-1K",
    imageSrc: "/urs-1k-guide.png",
    imageAlt: "URS-1K ketone strip usage and reading guide",
    note: "เทียบสีจากแถบตรวจกับคู่มือ แล้วเลือกค่าที่ตรงกับผลของคุณด้านล่าง",
  },
];

// ─── Answers type ───────────────────────────────────────────────────────────
export type PreBlowAnswers = Record<string, string | string[] | null>;

interface Props {
  onFinish: (answers: PreBlowAnswers | null) => void;
  onClose: () => void;
}

type Step = { kind: "intro" } | { kind: "question"; index: number };

export function PreBlowChecklist({ onFinish, onClose }: Props) {
  const [step, setStep] = useState<Step>({ kind: "intro" });
  const [answers, setAnswers] = useState<PreBlowAnswers>({});

  function goNext() {
    if (step.kind === "intro") {
      setStep({ kind: "question", index: 0 });
      return;
    }
    const next = step.index + 1;
    if (next >= QUESTIONS.length) {
      onFinish(answers);
    } else {
      setStep({ kind: "question", index: next });
    }
  }

  function goBack() {
    if (step.kind === "question") {
      if (step.index === 0) {
        setStep({ kind: "intro" });
      } else {
        setStep({ kind: "question", index: step.index - 1 });
      }
    }
  }

  function setAnswer(id: string, value: string | string[] | null) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  const currentQ = step.kind === "question" ? QUESTIONS[step.index] : null;
  const currentAnswer = currentQ ? answers[currentQ.id] ?? null : null;
  const canProceed =
    step.kind === "intro" ||
    (currentQ?.kind === "info") ||
    (currentQ?.kind === "single" && typeof currentAnswer === "string") ||
    (currentQ?.kind === "urine_color" && typeof currentAnswer === "string") ||
    (currentQ?.kind === "multi" && Array.isArray(currentAnswer) && currentAnswer.length > 0);

  const progress = step.kind === "intro" ? 0 : ((step.index + 1) / QUESTIONS.length) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full bg-bg-surface rounded-t-3xl pb-8 px-5 pt-5 max-w-md mx-auto max-h-[92vh] flex flex-col">
        <div className="w-10 h-1 bg-border-subtle rounded-full mx-auto mb-4 shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between mb-3 shrink-0">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={18} className="text-mint-500" />
            <h2 className="text-base font-semibold text-text-primary">
              {step.kind === "intro" ? "เช็คความพร้อมก่อนเป่า" : `คำถามที่ ${step.index + 1} / ${QUESTIONS.length}`}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-text-muted hover:text-text-primary transition-colors"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>

        {/* Progress bar (only when in questions) */}
        {step.kind === "question" && (
          <div className="h-1 w-full bg-border-subtle rounded-full overflow-hidden mb-4 shrink-0">
            <div
              className="h-full bg-mint-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        {/* Body — scrollable */}
        <div className="overflow-y-auto flex-1 min-h-0">
          {step.kind === "intro" ? (
            <IntroPanel />
          ) : (
            <QuestionPanel
              key={currentQ!.id}
              question={currentQ!}
              value={currentAnswer}
              onChange={(v) => setAnswer(currentQ!.id, v)}
            />
          )}
        </div>

        {/* Footer buttons */}
        <div className="pt-4 shrink-0">
          {step.kind === "intro" ? (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => onFinish(null)}
                className="py-3 rounded-2xl text-sm font-semibold bg-bg-elevated text-text-primary hover:bg-bg-raised transition-colors"
              >
                ไม่ทำ
              </button>
              <button
                onClick={goNext}
                className="py-3 rounded-2xl text-sm font-semibold bg-mint-500 text-black hover:bg-mint-400 transition-colors"
              >
                ทำ
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={goBack}
                className="h-11 w-11 rounded-2xl bg-bg-elevated text-text-primary flex items-center justify-center hover:bg-bg-raised transition-colors shrink-0"
                aria-label="ย้อนกลับ"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={goNext}
                disabled={!canProceed}
                className="flex-1 h-11 rounded-2xl bg-mint-500 text-black text-sm font-semibold flex items-center justify-center gap-1 hover:bg-mint-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {step.index === QUESTIONS.length - 1 ? "เริ่มเป่า" : "ถัดไป"}
                <ChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Intro ──────────────────────────────────────────────────────────────────
function IntroPanel() {
  return (
    <div className="space-y-3 py-2">
      <p className="text-sm text-text-primary leading-relaxed">
        ก่อนเริ่มการเป่าลมหายใจ คุณต้องการทำแบบสอบถามสั้น ๆ เพื่อบันทึกบริบท
        (อาหาร, การนอน, ความเครียด ฯลฯ) ให้ข้อมูลแม่นยำขึ้นหรือไม่
      </p>
      <ul className="text-xs text-text-muted list-disc pl-5 space-y-1">
        <li>ใช้เวลาประมาณ 1–2 นาที มีทั้งหมด {QUESTIONS.length} ข้อ</li>
        <li>ทำครั้งเดียว ใช้ประกอบผลการวัดครั้งนี้เท่านั้น</li>
        <li>เลือก "ไม่ทำ" หากต้องการเริ่มเป่าเลย</li>
      </ul>
    </div>
  );
}

// ─── Question renderer ──────────────────────────────────────────────────────
function QuestionPanel({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string | string[] | null;
  onChange: (v: string | string[]) => void;
}) {
  if (question.kind === "info") {
    return (
      <div className="space-y-3 py-1">
        <p className="text-sm font-semibold text-text-primary leading-snug">{question.title}</p>
        {question.imageSrc && (
          <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden bg-white">
            <Image
              src={question.imageSrc}
              alt={question.imageAlt ?? ""}
              fill
              sizes="(max-width: 480px) 100vw, 480px"
              className="object-contain"
            />
          </div>
        )}
        {question.note && (
          <p className="text-xs text-text-muted leading-relaxed">{question.note}</p>
        )}
      </div>
    );
  }

  if (question.kind === "urine_color") {
    const selected = typeof value === "string" ? value : null;
    return (
      <div className="space-y-3 py-1">
        <p className="text-sm font-semibold text-text-primary leading-snug">{question.title}</p>
        {question.imageSrc && (
          <div className="relative w-full aspect-[3/4] rounded-2xl overflow-hidden bg-white">
            <Image
              src={question.imageSrc}
              alt={question.imageAlt ?? ""}
              fill
              sizes="(max-width: 480px) 100vw, 480px"
              className="object-contain"
            />
          </div>
        )}
        {question.note && (
          <p className="text-xs text-text-muted leading-relaxed">{question.note}</p>
        )}
        <div className="grid grid-cols-5 gap-1.5">
          {URINE_BANDS.map((band) => {
            const active = selected === band.category;
            return (
              <button
                key={band.category}
                type="button"
                onClick={() => onChange(band.category)}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl py-3 transition-all ${
                  active
                    ? "ring-2 ring-mint-500 ring-offset-2 ring-offset-bg-surface scale-[1.03]"
                    : "opacity-90 hover:opacity-100 hover:scale-[1.02]"
                }`}
                style={{ background: band.color, color: band.text }}
                aria-pressed={active}
              >
                <span className="text-[10px] font-bold uppercase tracking-wide">
                  {band.label}
                </span>
                <span className="text-[10px] font-mono opacity-90">
                  {band.mmol.toFixed(1)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (question.kind === "single") {
    const selected = typeof value === "string" ? value : null;
    return (
      <div className="space-y-3 py-1">
        <p className="text-sm font-semibold text-text-primary leading-snug">{question.title}</p>
        <div className="space-y-2">
          {question.options!.map((opt) => {
            const active = selected === opt;
            return (
              <button
                key={opt}
                onClick={() => onChange(opt)}
                className={`w-full text-left px-4 py-3 rounded-2xl border text-sm transition-colors flex items-center gap-3 ${
                  active
                    ? "bg-mint-500/10 border-mint-500 text-text-primary"
                    : "bg-bg-elevated border-border-subtle text-text-primary hover:border-mint-500/40"
                }`}
              >
                <span
                  className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    active ? "border-mint-500" : "border-text-muted"
                  }`}
                >
                  {active && <span className="h-2 w-2 rounded-full bg-mint-500" />}
                </span>
                <span className="leading-snug">{opt}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // multi
  const selectedList = Array.isArray(value) ? value : [];
  function toggle(opt: string) {
    if (selectedList.includes(opt)) {
      onChange(selectedList.filter((v) => v !== opt));
    } else {
      onChange([...selectedList, opt]);
    }
  }
  return (
    <div className="space-y-3 py-1">
      <p className="text-sm font-semibold text-text-primary leading-snug">{question.title}</p>
      <div className="space-y-2">
        {question.options!.map((opt) => {
          const active = selectedList.includes(opt);
          return (
            <button
              key={opt}
              onClick={() => toggle(opt)}
              className={`w-full text-left px-4 py-3 rounded-2xl border text-sm transition-colors flex items-center gap-3 ${
                active
                  ? "bg-mint-500/10 border-mint-500 text-text-primary"
                  : "bg-bg-elevated border-border-subtle text-text-primary hover:border-mint-500/40"
              }`}
            >
              <span
                className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 ${
                  active ? "border-mint-500 bg-mint-500" : "border-text-muted"
                }`}
              >
                {active && (
                  <svg viewBox="0 0 12 12" className="h-3 w-3 text-black" fill="none">
                    <path
                      d="M2.5 6.5L5 9L9.5 3.5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </span>
              <span className="leading-snug">{opt}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
