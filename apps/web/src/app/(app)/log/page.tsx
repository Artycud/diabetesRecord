"use client";

import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api, type UrineCategory } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { toast } from "@/components/ui/toaster";
import {
  Activity, Bike, Check, Droplet, Dumbbell, Footprints,
  Pencil, Scale, Sparkles, TestTube, Utensils, Waves, Wind,
  type LucideIcon,
} from "lucide-react";
import { twMerge } from "tailwind-merge";

// Blood mode requires typing mmol; urine mode uses category picker (mmol is derived
// server-side from urine_category via signal_processing.urine_category_to_mmol).
const ketoneSchema = z.object({
  value_mmol: z.coerce.number().min(0).max(30).optional(),
  note: z.string().optional(),
});
const weightSchema = z.object({ kg: z.coerce.number().min(20).max(500) });
const mealSchema = z.object({
  name:    z.string().min(1),
  kcal:    z.coerce.number().min(0).optional(),
  carbs_g: z.coerce.number().min(0).optional(),
});
const activitySchema = z.object({
  kind:         z.string().min(1),
  duration_min: z.coerce.number().int().min(1),
  kcal:         z.coerce.number().min(0).optional(),
});

type KetoneForm   = z.infer<typeof ketoneSchema>;
type WeightForm   = z.infer<typeof weightSchema>;
type MealForm     = z.infer<typeof mealSchema>;
type ActivityForm = z.infer<typeof activitySchema>;

function FormHeader({ Icon, title, subtitle }: { Icon: LucideIcon; title: string; subtitle?: string }) {
  return (
    <div className="text-center py-4">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-mint-500/10 border border-mint-500/20">
        <Icon size={24} className="text-mint-500" strokeWidth={1.4} />
      </div>
      <h2 className="text-lg font-semibold text-text-primary mt-3 tracking-tight">{title}</h2>
      {subtitle && <p className="text-xs text-muted mt-1 leading-relaxed">{subtitle}</p>}
    </div>
  );
}

function SubmitBtn({ done, submitting, t }: { done: boolean; submitting: boolean; t: (k: string) => string }) {
  return (
    <Button type="submit" size="lg" className="w-full" disabled={submitting || done}>
      {done ? (
        <><Check size={16} strokeWidth={2} /> {t("common.saved")}</>
      ) : submitting ? (
        t("common.saving")
      ) : (
        t("common.save")
      )}
    </Button>
  );
}

// URS-1K color scale — matches signal_processing.URINE_KETONE_SCALE on the backend.
// Colors approximate the printed strip so users can pick by matching what they see.
const URINE_BANDS: {
  category: UrineCategory;
  label: string;
  mmol: number;
  mgdl: number;
  color: string;
  text: string;   // color of label text for contrast
}[] = [
  { category: "negative", label: "Neg",      mmol: 0.0, mgdl: 0,  color: "#EEE6BE", text: "#4A4023" },
  { category: "trace",    label: "Trace",    mmol: 0.5, mgdl: 5,  color: "#EBC7C0", text: "#4A2426" },
  { category: "small",    label: "Small",    mmol: 1.5, mgdl: 15, color: "#D48EA5", text: "#FFFFFF" },
  { category: "moderate", label: "Moderate", mmol: 4.0, mgdl: 40, color: "#9F507A", text: "#FFFFFF" },
  { category: "large",    label: "Large",    mmol: 8.0, mgdl: 80, color: "#5A2C55", text: "#FFFFFF" },
];

type KetoneMode = "urine" | "blood";

function KetoneForm() {
  const qc = useQueryClient();
  const { t } = useT();
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState<KetoneMode>("urine");
  const [urineCat, setUrineCat] = useState<UrineCategory | null>(null);
  const [urineError, setUrineError] = useState<string | null>(null);

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useForm<KetoneForm>({ resolver: zodResolver(ketoneSchema) as any });

  const onSubmit = async (data: KetoneForm) => {
    if (mode === "urine") {
      if (!urineCat) {
        setUrineError("เลือกสีที่ตรงกับแถบตรวจ");
        return;
      }
      setUrineError(null);
      await api.logs.postKetone({
        ketone_type: "urine",
        urine_category: urineCat,
        note: data.note,
      });
    } else {
      if (data.value_mmol == null || Number.isNaN(data.value_mmol)) {
        return;
      }
      await api.logs.postKetone({
        ketone_type: "blood",
        value_mmol: data.value_mmol,
        note: data.note,
      });
    }
    toast(t("log.ketone.toast"), "success");
    qc.invalidateQueries({ queryKey: ["ketone"] });
    reset();
    setUrineCat(null);
    setDone(true);
    setTimeout(() => setDone(false), 2500);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FormHeader
        Icon={TestTube}
        title={t("log.ketone.title")}
        subtitle="วัดจากแถบสีปัสสาวะ (URS-1K) หรือเครื่องเจาะเลือด"
      />

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("urine")}
          className={twMerge(
            "flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors",
            mode === "urine"
              ? "border-mint-500 bg-mint-500/10 text-mint-500"
              : "border-border-soft text-text-muted hover:border-border-strong",
          )}
        >
          <Waves size={15} strokeWidth={1.7} />
          แถบตรวจปัสสาวะ (URS-1K)
        </button>
        <button
          type="button"
          onClick={() => setMode("blood")}
          className={twMerge(
            "flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-medium transition-colors",
            mode === "blood"
              ? "border-mint-500 bg-mint-500/10 text-mint-500"
              : "border-border-soft text-text-muted hover:border-border-strong",
          )}
        >
          <Droplet size={15} strokeWidth={1.7} />
          เครื่องเจาะเลือด
        </button>
      </div>

      {/* URINE MODE — color chip picker */}
      {mode === "urine" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-text-secondary">
            เลือกสีที่ตรงกับแถบตรวจของคุณ
          </p>
          <div className="grid grid-cols-5 gap-1.5">
            {URINE_BANDS.map((band) => {
              const active = urineCat === band.category;
              return (
                <button
                  key={band.category}
                  type="button"
                  onClick={() => {
                    setUrineCat(band.category);
                    setUrineError(null);
                  }}
                  className={twMerge(
                    "flex flex-col items-center justify-center gap-1 rounded-xl py-3 transition-all",
                    active
                      ? "ring-2 ring-mint-500 ring-offset-2 ring-offset-bg-elevated scale-[1.03]"
                      : "opacity-90 hover:opacity-100 hover:scale-[1.02]",
                  )}
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

          {urineCat && (
            <div className="rounded-xl bg-bg-raised px-3 py-2 text-xs text-text-primary">
              <span className="font-medium">ค่าที่จะบันทึก:</span>{" "}
              <span className="font-mono">
                {URINE_BANDS.find((b) => b.category === urineCat)?.mmol.toFixed(1)} mmol/L
              </span>
              <span className="text-text-muted">
                {" "}(≈ {URINE_BANDS.find((b) => b.category === urineCat)?.mgdl} mg/dL,{" "}
                {URINE_BANDS.find((b) => b.category === urineCat)?.label} band)
              </span>
            </div>
          )}
          {urineError && !urineCat && (
            <p className="text-xs text-red-500">{urineError}</p>
          )}
        </div>
      )}

      {/* BLOOD MODE — numeric input */}
      {mode === "blood" && (
        <Input
          label="ค่าที่อ่านจากเครื่องเจาะเลือด (mmol/L)"
          type="number"
          step="0.01"
          placeholder="1.5"
          className={twMerge("stat-display text-4xl text-center h-16 text-text-primary placeholder:text-text-disabled")}
          error={errors.value_mmol ? t("log.ketone.errMax") : undefined}
          {...register("value_mmol")}
        />
      )}

      <Input
        label={t("log.ketone.note")}
        placeholder={t("log.ketone.notePlaceholder")}
        {...register("note")}
      />

      <SubmitBtn done={done} submitting={isSubmitting} t={t} />
    </form>
  );
}

function WeightFormComp() {
  const qc = useQueryClient();
  const { t } = useT();
  const [done, setDone] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useForm<WeightForm>({ resolver: zodResolver(weightSchema) as any });

  const onSubmit = async (data: WeightForm) => {
    await api.logs.postWeight(data);
    toast(t("log.weight.toast"), "success");
    qc.invalidateQueries({ queryKey: ["weight"] });
    reset();
    setDone(true);
    setTimeout(() => setDone(false), 2500);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FormHeader Icon={Scale} title={t("log.weight.title")} />
      <Input
        label={t("log.weight.value")}
        type="number"
        step="0.1"
        placeholder="65.0"
        className={twMerge("stat-display text-4xl text-center h-16 text-text-primary placeholder:text-text-disabled")}
        error={errors.kg?.message}
        {...register("kg")}
      />
      <SubmitBtn done={done} submitting={isSubmitting} t={t} />
    </form>
  );
}

function MealFormComp() {
  const qc = useQueryClient();
  const { t } = useT();
  const [done, setDone] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useForm<MealForm>({ resolver: zodResolver(mealSchema) as any });

  const onSubmit = async (data: MealForm) => {
    await api.logs.postMeal(data);
    toast(t("log.meal.toast"), "success");
    qc.invalidateQueries({ queryKey: ["meal"] });
    reset();
    setDone(true);
    setTimeout(() => setDone(false), 2500);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FormHeader Icon={Utensils} title={t("log.meal.title")} />
      <Input
        label={t("log.meal.name")}
        placeholder={t("log.meal.namePlaceholder")}
        error={errors.name ? t("log.meal.errNameRequired") : undefined}
        {...register("name")}
      />
      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t("log.meal.kcal")}
          type="number"
          placeholder="350"
          error={errors.kcal?.message}
          {...register("kcal")}
        />
        <Input
          label={t("log.meal.carbs")}
          type="number"
          placeholder="30"
          error={errors.carbs_g?.message}
          {...register("carbs_g")}
        />
      </div>
      <SubmitBtn done={done} submitting={isSubmitting} t={t} />
    </form>
  );
}

const ACTIVITY_KINDS: { value: string; Icon: LucideIcon }[] = [
  { value: "walk",  Icon: Footprints },
  { value: "run",   Icon: Activity   },
  { value: "cycle", Icon: Bike       },
  { value: "gym",   Icon: Dumbbell   },
  { value: "yoga",  Icon: Sparkles   },
  { value: "swim",  Icon: Waves      },
];

function ActivityFormComp() {
  const qc = useQueryClient();
  const { t } = useT();
  const [done, setDone] = useState(false);
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useForm<ActivityForm>({ resolver: zodResolver(activitySchema) as any });

  const onSubmit = async (data: ActivityForm) => {
    await api.logs.postActivity(data);
    toast(t("log.activity.toast"), "success");
    qc.invalidateQueries({ queryKey: ["activity"] });
    reset();
    setDone(true);
    setTimeout(() => setDone(false), 2500);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <FormHeader Icon={Activity} title={t("log.activity.title")} />

      <div className="space-y-1">
        <p className="text-sm font-medium text-text-secondary">{t("log.activity.kind")}</p>
        <div className="grid grid-cols-3 gap-2">
          {ACTIVITY_KINDS.map(({ value, Icon }) => (
            <label
              key={value}
              className="flex flex-col items-center justify-center gap-1 cursor-pointer rounded-xl border border-border-soft py-3 text-xs has-[:checked]:border-mint-500 has-[:checked]:bg-mint-500/10 has-[:checked]:text-mint-500"
            >
              <input type="radio" value={value} className="sr-only" {...register("kind")} />
              <Icon size={18} strokeWidth={1.5} />
              {t(`log.activity.kinds.${value}`)}
            </label>
          ))}
        </div>
        {errors.kind && <p className="text-xs text-red-500">{t("log.activity.errKindRequired")}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Input
          label={t("log.activity.duration")}
          type="number"
          placeholder="30"
          error={errors.duration_min?.message}
          {...register("duration_min")}
        />
        <Input
          label={t("log.activity.kcal")}
          type="number"
          placeholder="200"
          error={errors.kcal?.message}
          {...register("kcal")}
        />
      </div>

      <SubmitBtn done={done} submitting={isSubmitting} t={t} />
    </form>
  );
}

const TAB_MAP: Record<string, string> = {
  ketone: "ketone", weight: "weight", meal: "meal", activity: "activity",
};

export default function LogPage() {
  const searchParams = useSearchParams();
  const { t } = useT();
  const defaultTab = TAB_MAP[searchParams.get("tab") ?? ""] ?? "ketone";

  return (
    <div className="max-w-md mx-auto px-4 pt-12 md:pt-6 pb-6">
      <h1 className="text-2xl font-semibold text-text-primary mb-5 tracking-tight">{t("log.title")}</h1>

      <Tabs defaultValue={defaultTab}>
        <TabsList className="w-full mb-5">
          <TabsTrigger value="ketone">{t("log.tabs.ketone")}</TabsTrigger>
          <TabsTrigger value="weight">{t("log.tabs.weight")}</TabsTrigger>
          <TabsTrigger value="meal">{t("log.tabs.meal")}</TabsTrigger>
          <TabsTrigger value="activity">{t("log.tabs.activity")}</TabsTrigger>
        </TabsList>

        <Card>
          <CardContent className="pt-0">
            <TabsContent value="ketone">   <KetoneForm /> </TabsContent>
            <TabsContent value="weight">   <WeightFormComp /> </TabsContent>
            <TabsContent value="meal">     <MealFormComp /> </TabsContent>
            <TabsContent value="activity"> <ActivityFormComp /> </TabsContent>
          </CardContent>
        </Card>
      </Tabs>
    </div>
  );
}
