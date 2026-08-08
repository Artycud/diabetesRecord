"use client";

import { useQuery } from "@tanstack/react-query";
import { twMerge } from "tailwind-merge";
import { Activity, ArrowUpRight, ArrowDownRight, AlertTriangle, MinusCircle } from "lucide-react";

import { api, type TrendClass, type TrendClassifyResponse } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoButton } from "@/components/ui/InfoButton";

function TrendInfo() {
  return (
    <InfoButton title="Long-term trend" ariaLabel="รายละเอียด Long-term trend">
      <p>
        แนวโน้ม <b>ระยะยาว</b> ของค่า baseline breath acetone ในหลาย session ที่ผ่านมา — บอกว่าค่า
        <b>กำลังไปทางไหน</b> ไม่ใช่ค่าเดี่ยวตอนนี้
      </p>
      <p className="text-text-muted">
        คำนวณจาก <b>14 sessions ล่าสุด</b> โดยใช้โมเดล LSTM (Long Short-Term Memory) — ต้องมีอย่างน้อย
        5 sessions ถึงจะ classify ได้
      </p>
      <div className="bg-bg-elevated rounded-xl p-3 space-y-2">
        <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">4 ประเภทที่จำแนกได้</p>
        <ul className="text-xs space-y-1.5">
          <li>• <b>Stable</b> — ค่าคงที่ ไม่มีแนวโน้มที่ชัดเจน</li>
          <li>• <b>Increasing</b> — baseline ไต่ขึ้น (เช่น เริ่ม keto, ออกกำลังเพิ่ม)</li>
          <li>• <b>Decreasing</b> — baseline ลดลง (เช่น กลับมากินคาร์บ)</li>
          <li>• <b>Abnormal</b> — มี jump ผิดปกติ ให้วัดซ้ำ</li>
        </ul>
      </div>
      <p className="text-xs text-text-muted">
        ต่างจาก "สูงสุดวันนี้" ตรงที่ดู pattern ข้าม noise ของแต่ละครั้ง — เป็น monitoring signal ไม่ใช่การวินิจฉัย
      </p>
    </InfoButton>
  );
}

/**
 * TrendClassCard — surfaces the LSTM Trend Classifier output (Phase 3).
 *
 * The card answers a different question than the per-reading /ai/predict:
 * it tells the user which direction their own baseline is moving over
 * the last N sessions. It's a monitoring signal, not a diagnosis, and the
 * card copy explicitly says so.
 */
interface Props {
  deviceId: string | undefined;
  sessions?: number;   // how many recent sessions to consider (default 14)
  className?: string;
}

type TrendStyle = {
  icon: React.ComponentType<{ className?: string }>;
  ring: string;   // gradient/background classes for the icon well
  accent: string; // badge tint
};

const STYLES: Record<TrendClass, TrendStyle> = {
  stable: {
    icon: Activity,
    ring: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    accent: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  increasing: {
    icon: ArrowUpRight,
    ring: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    accent: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  decreasing: {
    icon: ArrowDownRight,
    ring: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    accent: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  abnormal: {
    icon: AlertTriangle,
    ring: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    accent: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
};

const UNKNOWN_STYLE: TrendStyle = {
  icon: MinusCircle,
  ring: "bg-muted/40 text-muted",
  accent: "bg-muted/40 text-muted",
};

export function TrendClassCard({ deviceId, sessions = 14, className }: Props) {
  const { t } = useT();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["ai", "trendClass", deviceId, sessions],
    queryFn: () => api.ai.classifyTrend(deviceId!, sessions),
    enabled: !!deviceId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (!deviceId || isLoading) {
    return (
      <Card className={twMerge("animate-pulse", className)}>
        <CardContent>
          <div className="h-4 w-24 rounded bg-muted/30" />
          <div className="mt-3 h-10 w-40 rounded bg-muted/20" />
          <div className="mt-4 h-3 w-full rounded bg-muted/10" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card className={className}>
        <CardContent>
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-muted">{t("trendClass.title")}</p>
            <TrendInfo />
          </div>
          <p className="mt-2 text-sm text-fg">{t("trendClass.unknown")}</p>
        </CardContent>
      </Card>
    );
  }

  return <TrendClassCardBody data={data} className={className} />;
}

function TrendClassCardBody({
  data,
  className,
}: {
  data: TrendClassifyResponse;
  className?: string;
}) {
  const { t } = useT();

  const insufficient =
    data.model_used === "insufficient_data" || data.trend === null;

  const trend = (data.trend ?? "stable") as TrendClass;
  const style: TrendStyle = insufficient
    ? UNKNOWN_STYLE
    : STYLES[trend] ?? UNKNOWN_STYLE;
  const Icon = style.icon;

  const modelLabel =
    data.model_used === "lstm_trend"
      ? t("trendClass.modelLstm")
      : data.model_used === "trend_rule_fallback"
        ? t("trendClass.modelRule")
        : t("trendClass.modelFallback");

  const lowConfidence = !insufficient && data.confidence < 0.6;

  return (
    <Card className={className}>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={twMerge("flex h-11 w-11 items-center justify-center rounded-xl", style.ring)}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted">
                {t("trendClass.title")}
              </p>
              <p className="text-lg font-semibold text-fg">
                {insufficient
                  ? t("trendClass.unknown")
                  : t(`trendClass.${trend}`)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!insufficient && (
              <Badge className={twMerge("border-0", style.accent)}>
                {Math.round(data.confidence * 100)}%
              </Badge>
            )}
            <TrendInfo />
          </div>
        </div>

        <p className="text-sm leading-relaxed text-fg-soft">
          {insufficient
            ? t("trendClass.insufficient", {
                min: data.min_required,
                have: data.sequence_length,
              })
            : t(`trendClass.${trend}Desc`)}
        </p>

        {!insufficient && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>{t("trendClass.basedOn", { n: data.sequence_length })}</span>
            <span aria-hidden="true">·</span>
            <span>{modelLabel}</span>
            {lowConfidence && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-600 dark:text-amber-400">
                  {t("trendClass.lowConfidence")}
                </span>
              </>
            )}
          </div>
        )}

        <p className="text-[11px] leading-snug text-muted">
          {t("trendClass.disclaimer")}
        </p>
      </CardContent>
    </Card>
  );
}
