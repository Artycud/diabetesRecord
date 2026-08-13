"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { twMerge } from "tailwind-merge";
import { api } from "@/lib/api";
import { convertFromMv, useUnits } from "@/lib/units";
import { useTimezone } from "@/lib/timezone";
import { backendLabelToZone, LABEL_STYLE, LABEL_TH } from "@/lib/riskLabel";
import { StatNumber } from "@/components/ui/StatNumber";
import { Sparkline } from "@/components/ui/Sparkline";

// Deliberate cap, not a true unbounded look-back — a device untouched for
// three-plus months warrants a fresh-start prompt rather than an
// ever-widening history query.
const FALLBACK_WINDOW_DAYS = 90;

interface Props {
  deviceId: string | null | undefined;
  /** "hero" renders the number at the app's largest stat size, wrapped in a
   *  zone-tinted ring — reserved for the single primary reading on Home.
   *  Defaults to the original compact presentation used elsewhere. */
  size?: "md" | "hero";
  /** One-shot scale beat on the ring, meant for the instant a fresh reading
   *  lands (see Home's justRevealed flag) — not a loop. */
  pulse?: boolean;
}

export function AcetoneTrendChart({ deviceId, size = "md", pulse = false }: Props) {
  const { format: fmtAcetone, unit: acUnit, label: unitLbl } = useUnits();
  const { formatTime, formatDate } = useTimezone();

  const { data: todayReadings, isLoading: todayLoading } = useQuery({
    queryKey: ["sensor-readings", deviceId, "home-sparkline-today"],
    queryFn: () => api.sensor.getReadings(deviceId!, 1, 0),
    enabled: !!deviceId,
    refetchInterval: 60_000,
  });

  const hasToday = (todayReadings ?? []).some((r) => r.acetone_delta != null);

  // Only queried once we know today is empty — avoids a wasted request on
  // the common "already checked in today" path.
  const { data: fallbackStats, isLoading: fallbackLoading } = useQuery({
    queryKey: ["sensor", "daily-stats", deviceId, "home-sparkline-fallback"],
    queryFn: () => api.sensor.getDailyStats(deviceId!, FALLBACK_WINDOW_DAYS, "day"),
    enabled: !!deviceId && !todayLoading && !hasToday,
    staleTime: 5 * 60 * 1000,
  });

  const fallbackDays = useMemo(
    () => (fallbackStats ?? []).filter((d) => d.count > 0 && d.avg_acetone_delta != null),
    [fallbackStats]
  );

  const mode: "loading" | "today" | "history" | "empty" =
    todayLoading || (!hasToday && fallbackLoading)
      ? "loading"
      : hasToday
        ? "today"
        : fallbackDays.length > 0
          ? "history"
          : "empty";

  const points = useMemo(() => {
    if (mode === "today") {
      return (todayReadings ?? [])
        .filter((r) => r.acetone_delta != null)
        .map((r) => ({ x: formatTime(r.time), y: convertFromMv(r.acetone_delta!, acUnit) }));
    }
    if (mode === "history") {
      return fallbackDays.map((d) => ({ x: formatDate(d.date), y: convertFromMv(d.avg_acetone_delta!, acUnit) }));
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, todayReadings, fallbackDays, acUnit]);

  const latestRawMv =
    mode === "today"
      ? [...(todayReadings ?? [])].reverse().find((r) => r.acetone_delta != null)?.acetone_delta ?? null
      : mode === "history"
        ? fallbackDays.at(-1)?.avg_acetone_delta ?? null
        : null;

  const latestLabel =
    mode === "today"
      ? [...(todayReadings ?? [])].reverse().find((r) => r.acetone_delta != null)?.label ?? null
      : mode === "history"
        ? fallbackDays.at(-1)?.dominant_label ?? null
        : null;

  // Only meaningful in "today" mode — the history fallback aggregates whole
  // days, which have no single time-of-day to caption.
  const latestTime =
    mode === "today"
      ? [...(todayReadings ?? [])].reverse().find((r) => r.acetone_delta != null)?.time ?? null
      : null;

  const zone = backendLabelToZone(latestLabel);
  const style = LABEL_STYLE[zone] ?? LABEL_STYLE.unreliable;

  if (mode === "loading") {
    return (
      <div className="w-full space-y-3 animate-pulse">
        <div className="h-9 w-32 bg-bg-raised rounded-lg mx-auto" />
        <div className="h-[90px] w-full bg-bg-raised rounded-xl" />
      </div>
    );
  }

  if (mode === "empty") {
    return (
      <div className="flex flex-col items-center gap-2 py-4 text-center">
        <span className="text-3xl">🫁</span>
        <p className="text-sm text-text-muted">ยังไม่มีข้อมูล breath acetone</p>
        <Link href="/breathing" className="text-xs text-mint-500 font-medium">
          เริ่มตรวจ →
        </Link>
      </div>
    );
  }

  const numberEl = (
    <StatNumber
      value={latestRawMv != null ? fmtAcetone(latestRawMv) : "—"}
      unit={unitLbl}
      size={size === "hero" ? "hero" : "2xl"}
      color={latestRawMv != null ? style.color : undefined}
    />
  );

  return (
    <div className="w-full space-y-2">
      <div className="flex items-baseline justify-center gap-2">
        {size === "hero" ? (
          <div
            className={twMerge(
              "flex items-center justify-center rounded-full px-8 py-6 sm:px-10 sm:py-7",
              pulse && "animate-zone-pulse"
            )}
            style={{
              background: `radial-gradient(circle, ${style.color}20, ${style.color}08 65%, transparent 100%)`,
              boxShadow: `0 0 0 3px ${style.color}30, inset 0 0 0 1px ${style.color}15`,
            }}
          >
            {numberEl}
          </div>
        ) : (
          numberEl
        )}
      </div>
      {(latestLabel || latestTime) && (
        <div className="flex items-center justify-center gap-1.5">
          {latestLabel && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{ color: style.color, backgroundColor: `${style.color}18` }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: style.color }} />
              {LABEL_TH[zone] ?? latestLabel}
            </span>
          )}
          {latestTime && (
            <span className="text-xs text-text-disabled">{formatTime(latestTime)}</span>
          )}
        </div>
      )}
      <Sparkline data={points} color={style.color} height={90} />
      <p className="text-center text-[11px] text-text-disabled uppercase tracking-widest">
        {mode === "today" ? "Today" : `Last ${points.length} days with data`}
      </p>
    </div>
  );
}
