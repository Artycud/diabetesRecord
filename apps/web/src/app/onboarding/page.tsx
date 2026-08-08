"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { DrumPicker } from "@/components/ui/drum-picker";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { twMerge } from "tailwind-merge";
import { BrandMark } from "@/components/brand/logo";
import { OnboardingFigureBg } from "@/components/ui/onboarding-figure-bg";
import { Leaf, Clock, Dumbbell, LineChart, Bell, type LucideIcon } from "lucide-react";

const bodySchema = z.object({
  height_cm: z.coerce.number().min(100).max(250).optional(),
  weight_kg: z.coerce.number().min(20).max(300).optional(),
  dob:       z.string().optional(),
  sex:       z.enum(["male", "female", "other"]).optional(),
});
type BodyData = z.infer<typeof bodySchema>;

const GOAL_ICON: Record<string, LucideIcon> = {
  keto: Leaf, fasting: Clock, exercise: Dumbbell, monitor: LineChart,
};

export default function OnboardingPage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { t, locale } = useT();
  const [step, setStep] = useState(0);
  const [subStep, setSubStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const { handleSubmit, setValue } = useForm<BodyData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(bodySchema) as any,
  });

  const WEIGHTS = Array.from({ length: 341 }, (_, i) => Math.round((i * 0.5 + 30) * 10) / 10); // 30.0–200.0 kg (0.5 step)
  const HEIGHTS = Array.from({ length: 121 }, (_, i) => i + 100);  // 100–220 cm
  const AGES    = Array.from({ length: 81  }, (_, i) => i + 10);   // 10–90 yrs

  const swipeRef = useRef<{ startX: number } | null>(null);

  const [drumWeight, setDrumWeight] = useState(65.0);
  const [drumHeight, setDrumHeight] = useState(170);
  const [drumAge,    setDrumAge]    = useState(35);
  const [sexVal,     setSexVal]     = useState<"male" | "female" | "other" | "">("");

  const goal = user?.profile?.goal_type ?? "monitor";
  const GoalIcon = GOAL_ICON[goal] ?? LineChart;

  const [displayGoals, setDisplayGoals] = useState<string[]>([]);
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("signup_goals");
      const parsed: string[] = stored ? JSON.parse(stored) : [];
      setDisplayGoals(parsed.length > 0 ? parsed : [goal]);
    } catch {
      setDisplayGoals([goal]);
    }
  }, [goal]);

  const steps = [t("onboarding.steps.goal"), t("onboarding.steps.body"), t("onboarding.steps.schedule")];

  const finish = async (data: BodyData) => {
    setSaving(true);
    try {
      await api.auth.updateProfile({
        ...data,
        onboarded_at: new Date().toISOString(),
      });
      await refreshUser();
      router.replace("/home");
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <BrandMark className="h-14 w-14 rounded-2xl mb-4 mx-auto block" />
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">{t("onboarding.welcome")}</h1>
          <p className="text-sm text-muted mt-1">
            {t("onboarding.hello")}, {user?.profile?.display_name ?? user?.username}
          </p>
        </div>

        {/* Progress */}
        <div className="flex gap-2 mb-6">
          {steps.map((s, i) => (
            <div key={s} className="flex-1 flex flex-col items-center gap-1.5">
              <div
                className={twMerge(
                  "h-1 w-full rounded-full transition-colors",
                  i <= step ? "bg-mint-500" : "bg-border"
                )}
              />
              <span className={twMerge("text-[11px]", i <= step ? "text-mint-700 font-medium" : "text-muted")}>
                {s}
              </span>
            </div>
          ))}
        </div>

        {/* Step 0: Goal confirm */}
        {step === 0 && (
          <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: "#142552" }}>
            {/* Hero illustration */}
            <div className="relative">
              <img
                src={`/goal-${displayGoals[0] ?? goal}.webp`}
                className="w-full object-cover"
                style={{ height: 150 }}
                alt=""
                draggable={false}
              />
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{ background: "radial-gradient(ellipse 80% 60% at 50% 0%, rgba(72,199,140,0.18) 0%, transparent 55%)" }}
              />
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{ background: "linear-gradient(to bottom, transparent 40%, #0c1838 100%)" }}
              />
            </div>

            {/* Content */}
            <div className="px-5 pt-3 pb-5 space-y-4">
              <h2 className="text-center text-xl font-bold text-white tracking-tight leading-snug">
                {t("onboarding.tagline")}
              </h2>

              <div className="flex flex-wrap gap-2 justify-center">
                {displayGoals.map((g) => {
                  const Icon = GOAL_ICON[g] ?? LineChart;
                  return (
                    <div
                      key={g}
                      className="flex items-center gap-2 rounded-2xl border border-mint-500/40 px-4 py-2"
                      style={{ background: "rgba(255,255,255,0.06)" }}
                    >
                      <Icon size={16} className="text-mint-400" strokeWidth={2} />
                      <span className="text-sm font-semibold text-white/90">{t(`goal.${g}`)}</span>
                    </div>
                  );
                })}
              </div>

              <Button size="lg" className="w-full" onClick={() => { setSubStep(0); setStep(1); }}>
                {t("common.next")}
              </Button>
            </div>
          </div>
        )}

        {/* Step 1, subStep 0 — Drum pickers (dark card) */}
        {step === 1 && subStep === 0 && (
          <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: "#142552" }}>
            <div className="px-5 pt-5 pb-3 text-center">
              <h2 className="text-base font-bold text-white tracking-wide uppercase">
                {t("onboarding.bodyTitle")}
              </h2>
            </div>

            <div className="px-4 space-y-3 pb-4">
              <DrumPicker
                values={WEIGHTS}
                value={drumWeight}
                onChange={setDrumWeight}
                label={t("onboarding.weight")}
                unit="kg"
                bgImage="/body-weight.webp"
                format={(v) => v.toFixed(1)}
              />
              <DrumPicker
                values={HEIGHTS}
                value={drumHeight}
                onChange={setDrumHeight}
                label={t("onboarding.height")}
                unit="cm"
                bgImage="/body-height-2.png"
              />
              <DrumPicker
                values={AGES}
                value={drumAge}
                onChange={setDrumAge}
                label={t("onboarding.age")}
                unit={t("onboarding.ageUnit")}
                bgImage="/body-age.webp"
              />
            </div>

            <div className="px-4 pb-5 flex gap-2">
              <Button variant="ghost" size="lg" className="flex-1 text-white/60 hover:text-white hover:bg-white/10"
                onClick={() => setStep(0)}>
                {t("common.back")}
              </Button>
              <Button size="lg" className="flex-1" onClick={() => {
                setValue("weight_kg", drumWeight);
                setValue("height_cm", drumHeight);
                const birthYear = new Date().getFullYear() - drumAge;
                setValue("dob", `${birthYear}-06-15`);
                if (!sexVal) { setSexVal("male"); setValue("sex", "male"); }
                setSubStep(1);
              }}>
                {t("common.next")}
              </Button>
            </div>
          </div>
        )}

        {/* Step 1, subStep 1 — Gender carousel (single figure + peek) */}
        {step === 1 && subStep === 1 && (() => {
          // PEEK: width of the next-figure strip visible at the edge (px)
          // FIGURE_W: natural render width of the 1000×1000 img at height=300 → 300px
          // Math: inner 300px container centered in 80px peek strip
          //   → img center at 40px (center of strip) → person ±40px fills the strip exactly
          const PEEK = 80;
          const FIGURE_W = 300;
          const isFemale = sexVal === "female";

          return (
            <div className="rounded-2xl border border-white/10 overflow-hidden" style={{ background: "#142552" }}>
              {/* Header */}
              <div className="px-5 pt-5 pb-3 text-center">
                <h2 className="text-base font-bold text-white tracking-wide uppercase">
                  {t("onboarding.bodyTitle")}
                </h2>
                <p className="text-xs text-white/55 mt-1 leading-relaxed">{t("onboarding.sex")}</p>
              </div>

              {/* Carousel viewport */}
              <div
                className="mx-4 rounded-xl overflow-hidden relative"
                style={{ height: 300 } as React.CSSProperties}
                onPointerDown={(e) => {
                  swipeRef.current = { startX: e.clientX };
                  e.currentTarget.setPointerCapture(e.pointerId);
                }}
                onPointerUp={(e) => {
                  if (!swipeRef.current) return;
                  const delta = e.clientX - swipeRef.current.startX;
                  swipeRef.current = null;
                  if (delta < -40) { setSexVal("female"); setValue("sex", "female"); }
                  else if (delta > 40) { setSexVal("male"); setValue("sex", "male"); }
                }}
                onPointerCancel={() => { swipeRef.current = null; }}
              >
                {/* ── Male sliding panel ── */}
                <div
                  className="absolute inset-0 flex items-end justify-center"
                  style={{
                    background: "linear-gradient(165deg, #142552 0%, #0e1a3e 100%)",
                    transform: isFemale ? "translateX(-100%)" : "translateX(0)",
                    transition: "transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)",
                    zIndex: 1,
                  } as React.CSSProperties}
                >
                  {/* Mint glow */}
                  <div aria-hidden className="pointer-events-none absolute inset-0"
                    style={{ background: "radial-gradient(ellipse 80% 60% at 50% 10%, rgba(72,199,140,0.20) 0%, transparent 65%)" }} />
                  <img src="/gender-male.png" alt={t("onboarding.male")}
                    className="pointer-events-none relative z-10"
                    style={{ height: "100%", width: "auto", flexShrink: 0 } as React.CSSProperties}
                    draggable={false} />
                  {/* Ground shadow */}
                  <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 z-20"
                    style={{ width: "55%", height: 36, background: "radial-gradient(ellipse 100% 100% at 50% 100%, rgba(0,0,0,0.55) 0%, transparent 70%)" }} />
                </div>

                {/* ── Female sliding panel ── */}
                <div
                  className="absolute inset-0 flex items-end justify-center"
                  style={{
                    background: "linear-gradient(165deg, #142552 0%, #0e1a3e 100%)",
                    transform: isFemale ? "translateX(0)" : "translateX(100%)",
                    transition: "transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94)",
                    zIndex: 1,
                  } as React.CSSProperties}
                >
                  <div aria-hidden className="pointer-events-none absolute inset-0"
                    style={{ background: "radial-gradient(ellipse 80% 60% at 50% 10%, rgba(72,199,140,0.20) 0%, transparent 65%)" }} />
                  <img src="/gender-female.png" alt={t("onboarding.female")}
                    className="pointer-events-none relative z-10"
                    style={{ height: "100%", width: "auto", flexShrink: 0 } as React.CSSProperties}
                    draggable={false} />
                  <div aria-hidden className="pointer-events-none absolute bottom-0 left-1/2 -translate-x-1/2 z-20"
                    style={{ width: "55%", height: 36, background: "radial-gradient(ellipse 100% 100% at 50% 100%, rgba(0,0,0,0.55) 0%, transparent 70%)" }} />
                </div>

                {/* ── RIGHT peek strip: female (shown while male selected) ── */}
                <div
                  className="absolute top-0 bottom-0 right-0 overflow-hidden"
                  style={{
                    width: PEEK, zIndex: 2,
                    opacity: isFemale ? 0 : 1,
                    transition: "opacity 0.25s ease",
                    cursor: "pointer",
                    WebkitMaskImage: "linear-gradient(to right, transparent 0%, black 55%)",
                    maskImage: "linear-gradient(to right, transparent 0%, black 55%)",
                  } as React.CSSProperties}
                  onClick={() => { setSexVal("female"); setValue("sex", "female"); }}
                >
                  <div aria-hidden className="absolute inset-0"
                    style={{ background: "linear-gradient(165deg, #142552 0%, #0e1a3e 100%)" }} />
                  <div className="absolute top-0 bottom-0 flex items-end justify-center overflow-hidden"
                    style={{ left: "50%", width: FIGURE_W, transform: "translateX(-50%)" } as React.CSSProperties}>
                    <img src="/gender-female.png" className="pointer-events-none relative z-10"
                      style={{ height: "100%", width: "auto", flexShrink: 0, opacity: 0.7 } as React.CSSProperties}
                      draggable={false} />
                  </div>
                </div>

                {/* ── LEFT peek strip: male (shown while female selected) ── */}
                <div
                  className="absolute top-0 bottom-0 left-0 overflow-hidden"
                  style={{
                    width: PEEK, zIndex: 2,
                    opacity: isFemale ? 1 : 0,
                    transition: "opacity 0.25s ease",
                    cursor: "pointer",
                    WebkitMaskImage: "linear-gradient(to left, transparent 0%, black 55%)",
                    maskImage: "linear-gradient(to left, transparent 0%, black 55%)",
                  } as React.CSSProperties}
                  onClick={() => { setSexVal("male"); setValue("sex", "male"); }}
                >
                  <div aria-hidden className="absolute inset-0"
                    style={{ background: "linear-gradient(165deg, #142552 0%, #0e1a3e 100%)" }} />
                  <div className="absolute top-0 bottom-0 flex items-end justify-center overflow-hidden"
                    style={{ left: "50%", width: FIGURE_W, transform: "translateX(-50%)" } as React.CSSProperties}>
                    <img src="/gender-male.png" className="pointer-events-none relative z-10"
                      style={{ height: "100%", width: "auto", flexShrink: 0, opacity: 0.7 } as React.CSSProperties}
                      draggable={false} />
                  </div>
                </div>
              </div>

              {/* Label + indicator dots */}
              <div className="text-center pt-3 pb-1">
                <p className="text-white font-bold text-lg tracking-tight">
                  {isFemale ? t("onboarding.female") : t("onboarding.male")}
                </p>
                <div className="flex gap-2 justify-center mt-2">
                  {(["male", "female"] as const).map((s) => (
                    <button
                      key={s} type="button"
                      onClick={() => { setSexVal(s); setValue("sex", s); }}
                      className={twMerge(
                        "h-1.5 rounded-full transition-all duration-300",
                        (sexVal === s || (sexVal === "" && s === "male")) ? "w-6 bg-mint-500" : "w-1.5 bg-white/25"
                      )}
                    />
                  ))}
                </div>
              </div>

              {/* Nav buttons */}
              <div className="px-4 pt-3 pb-3 flex gap-2">
                <Button variant="ghost" size="lg"
                  className="flex-1 text-white/60 hover:text-white hover:bg-white/10"
                  onClick={() => setSubStep(0)}>
                  {t("common.back")}
                </Button>
                <Button size="lg" className="flex-1" onClick={() => setStep(2)}>
                  {t("common.next")}
                </Button>
              </div>

              {/* Prefer not to say */}
              <button
                type="button"
                onClick={() => { setSexVal("other"); setValue("sex", "other"); setStep(2); }}
                className={twMerge(
                  "w-full pb-5 text-center text-sm transition-colors",
                  sexVal === "other" ? "text-mint-400 font-medium" : "text-white/28 hover:text-white/50"
                )}
              >
                {t("onboarding.other")} →
              </button>
            </div>
          );
        })()}

        {/* Step 2: Schedule / done */}
        {step === 2 && (
          <form
            onSubmit={handleSubmit(finish)}
            className="rounded-2xl border border-white/10 overflow-hidden"
            style={{ background: "#142552" }}
          >
            {/* Hero — glow + title + subtitle + section label */}
            <OnboardingFigureBg className="flex flex-col items-center justify-end pb-5 px-5 gap-3" style={{ height: 200 }}>
              <div className="relative flex items-center justify-center mb-1">
                <div className="absolute h-24 w-24 rounded-full border border-mint-400/8 animate-[ping_3s_ease-in-out_infinite]" />
                <div className="absolute h-16 w-16 rounded-full border border-mint-400/12" />
                <div className="absolute h-10 w-10 rounded-full border border-mint-400/18" />
                <div className="h-4 w-4 rounded-full bg-mint-400/50 shadow-[0_0_18px_6px_rgba(72,199,140,0.35)]" />
              </div>
              <div className="text-center space-y-1">
                <h2 className="text-2xl font-bold text-white tracking-tight leading-snug">
                  {t("onboarding.doneTitle")}
                </h2>
                <p className="text-sm text-white/50 leading-relaxed">
                  {t("onboarding.doneSubtitle")}
                </p>
              </div>
              <p className="text-xs font-bold text-mint-400 uppercase tracking-widest">
                {t("onboarding.tipTitle")}
              </p>
            </OnboardingFigureBg>

            {/* Schedule rows + buttons */}
            <div className="px-5 pt-4 pb-5 space-y-4">
              <div className="space-y-2">
                {([
                  { emoji: "🌅", key: "tipTime1" },
                  { emoji: "🍳", key: "tipTime2" },
                  { emoji: "⏱️", key: "tipTime3" },
                ] as const).map(({ emoji, key }) => (
                  <div key={key} className="flex items-center gap-3.5 rounded-xl px-4 py-3.5 border border-white/6"
                    style={{ background: "rgba(255,255,255,0.05)" }}>
                    <span className="text-xl leading-none">{emoji}</span>
                    <span className="text-base font-semibold text-white/90">{t(`onboarding.${key}`)}</span>
                  </div>
                ))}
                <p className="text-xs text-mint-400 font-medium text-center italic pt-0.5">
                  {t("onboarding.tipFooter")}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="lg"
                  className="flex-1 text-white/60 hover:text-white hover:bg-white/10"
                  onClick={() => { setStep(1); setSubStep(1); }}
                >
                  {t("common.back")}
                </Button>
                <Button type="submit" size="lg" className="flex-1" disabled={saving}>
                  {saving ? t("common.saving") : t("onboarding.start")}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
