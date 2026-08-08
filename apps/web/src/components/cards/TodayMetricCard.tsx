"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { twMerge } from "tailwind-merge";
import { api, type WeightLog, type ActivityLog } from "@/lib/api";

// ── Metric definitions ─────────────────────────────────────────────────────
// Steps + calories are stored in `activity_log` with a well-known `kind` string,
// so no new backend endpoint is required.
export type MetricKind = "weight" | "steps" | "calories";

const ACTIVITY_KIND: Record<Exclude<MetricKind, "weight">, string> = {
  steps:    "steps",
  calories: "calories_burned",
};

const META: Record<
  MetricKind,
  {
    icon: string;
    label: string;
    unit: string;
    step: number;
    min: number;
    max: number;
    placeholder: string;
    decimals: number;
  }
> = {
  weight:   { icon: "⚖️", label: "น้ำหนัก",         unit: "kg",   step: 0.1, min: 20, max: 250,    placeholder: "65.5", decimals: 1 },
  steps:    { icon: "👣", label: "ก้าวเดิน",        unit: "ก้าว", step: 100, min: 0,  max: 100000, placeholder: "5000", decimals: 0 },
  calories: { icon: "🔥", label: "แคลอรี่ที่ใช้",    unit: "kcal", step: 10,  min: 0,  max: 10000,  placeholder: "500",  decimals: 0 },
};

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isToday(iso: string): boolean {
  return iso.startsWith(todayIso());
}

interface Props {
  kind: MetricKind;
}

export function TodayMetricCard({ kind }: Props) {
  const qc = useQueryClient();
  const meta = META[kind];
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  // Fetch today's latest entry
  const { data: todayValue } = useQuery({
    queryKey: ["logs", kind, "today"],
    queryFn: async (): Promise<number | null> => {
      if (kind === "weight") {
        const rows = await api.logs.getWeight({ days: 1 });
        const t = rows.filter((r) => isToday(r.ts)).at(-1) as WeightLog | undefined;
        return t?.kg ?? null;
      }
      const rows = await api.logs.getActivity({ days: 1 });
      const wantKind = ACTIVITY_KIND[kind];
      const todayRows = rows.filter((r) => isToday(r.ts) && r.kind === wantKind);
      const latest = todayRows.at(-1) as ActivityLog | undefined;
      if (!latest) return null;
      return kind === "steps" ? latest.duration_min : (latest.kcal ?? null);
    },
    refetchOnWindowFocus: true,
  });

  const displayValue = useMemo(() => {
    if (todayValue == null) return null;
    return todayValue.toFixed(meta.decimals);
  }, [todayValue, meta.decimals]);

  const saveMutation = useMutation({
    mutationFn: async (num: number) => {
      if (kind === "weight") return api.logs.postWeight({ kg: num });
      if (kind === "steps") {
        return api.logs.postActivity({
          kind: ACTIVITY_KIND.steps,
          duration_min: Math.round(num),   // reused int column stores step count
        });
      }
      return api.logs.postActivity({
        kind: ACTIVITY_KIND.calories,
        duration_min: 0,
        kcal: num,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["logs", kind, "today"] });
      qc.invalidateQueries({ queryKey: ["weight"] });
      toast.success("บันทึกแล้ว");
      setOpen(false);
      setValue("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ"),
  });

  function handleOpen() {
    setValue(displayValue ?? "");
    setOpen(true);
  }

  function handleSave() {
    const num = Number(value);
    if (!Number.isFinite(num) || num < meta.min || num > meta.max) {
      toast.error(`ค่าต้องอยู่ระหว่าง ${meta.min}–${meta.max} ${meta.unit}`);
      return;
    }
    saveMutation.mutate(num);
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className={twMerge(
          "rounded-2xl p-3 text-left border border-border-soft bg-bg-surface card-shadow transition-all active:scale-95 hover:bg-bg-raised"
        )}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-sm">{meta.icon}</span>
          <p className="text-[10px] text-text-muted uppercase tracking-widest font-medium">{meta.label}</p>
        </div>
        <div className="flex items-baseline gap-1">
          <p className="text-lg font-bold text-text-primary leading-none">{displayValue ?? "—"}</p>
          <p className="text-[10px] text-text-muted">{meta.unit}</p>
        </div>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-bg-elevated rounded-2xl p-5 max-w-sm w-full space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <p className="text-xs text-text-muted">วันนี้</p>
              <h2 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <span>{meta.icon}</span> {meta.label}
              </h2>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="number"
                autoFocus
                step={meta.step}
                min={meta.min}
                max={meta.max}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={meta.placeholder}
                className="flex-1 bg-bg-raised rounded-xl px-4 py-3 text-2xl font-bold text-text-primary focus:outline-none focus:ring-2 focus:ring-mint-500"
              />
              <span className="text-sm font-medium text-text-muted min-w-[50px]">{meta.unit}</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={saveMutation.isPending}
                className="flex-1 bg-bg-raised text-text-primary rounded-full py-2.5 text-sm font-medium"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending || !value}
                className="flex-1 bg-mint-500 text-white rounded-full py-2.5 text-sm font-semibold disabled:opacity-50"
              >
                {saveMutation.isPending ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
