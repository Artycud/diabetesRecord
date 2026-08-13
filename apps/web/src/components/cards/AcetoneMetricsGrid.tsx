"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { api, type DailyStat, type SessionSummaryOut } from "@/lib/api";
import { convertFromMv, useUnits } from "@/lib/units";
import { useTimezone } from "@/lib/timezone";
import { useT } from "@/lib/i18n";
import { backendLabelToZone, LABEL_EN, LABEL_STYLE, LABEL_TH } from "@/lib/riskLabel";
import { Card } from "@/components/ui/card";
import { StatNumber } from "@/components/ui/StatNumber";
import { Sparkline } from "@/components/ui/Sparkline";

const WINDOW_DAYS = 14;
const NEUTRAL_COLOR = "#8E8E93";

interface Props {
  deviceId: string;
  /** Skip the outer Card chrome — for when a parent (Home's unified Details
   *  container) already supplies the card border/background/padding. */
  bare?: boolean;
  /** Shared 365-day session list from home/page.tsx — lets "Current State"/
   *  "Latest Peak" fall back to the most recent real reading (any age)
   *  instead of "No data yet" when this hook's own 14-day window is empty
   *  but FloatingHero/HomeBentoGrid are already showing older data via the
   *  same list, which would otherwise be a visible parity gap. */
  recentSessions?: SessionSummaryOut[];
}

/** A tile with nothing to show yet — deliberately quiet (italic, disabled
 *  color, same as other "no data" copy app-wide) so it reads as an
 *  intentional empty state, not a stuck loading skeleton or broken number. */
function EmptyValue({ text }: { text: string }) {
  return <p className="text-sm text-text-disabled italic">{text}</p>;
}

function mean(days: DailyStat[]): number | null {
  const withData = days.filter((d) => d.count > 0 && d.avg_acetone_delta != null);
  if (withData.length === 0) return null;
  return withData.reduce((sum, d) => sum + d.avg_acetone_delta!, 0) / withData.length;
}

function Tile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-4 bg-bg-raised flex flex-col gap-1.5 min-w-0">
      <p className="text-xs text-text-muted font-semibold uppercase tracking-wider">{label}</p>
      {children}
    </div>
  );
}

/** The 14-day-window stats computation shared by AcetoneMetricsGrid and
 *  HomeStatsPillBar — same queryKey as before extraction, so both callers
 *  share one TanStack Query cache entry instead of issuing duplicate
 *  requests. */
export function useAcetoneWeeklyMetrics(deviceId: string | null | undefined, days: number = WINDOW_DAYS) {
  const { unit: acUnit } = useUnits();

  const { data, isLoading } = useQuery({
    queryKey: ["sensor", "daily-stats", deviceId, "home-metrics-grid", days],
    queryFn: () => api.sensor.getDailyStats(deviceId!, days, "day"),
    enabled: !!deviceId,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 60_000,
  });

  const stats = useMemo(() => {
    const daysData = data ?? [];
    // getDailyStats returns one bucket per calendar day in the window,
    // oldest first — the most recent 7 are this week, the 7 before are last week.
    const lastWeek = daysData.slice(-7);
    const prevWeek = daysData.slice(0, Math.max(0, daysData.length - 7));

    const avg7 = mean(lastWeek);
    const avgPrev7 = mean(prevWeek);
    const deltaPct = avg7 != null && avgPrev7 ? Math.round(((avg7 - avgPrev7) / avgPrev7) * 100) : null;

    const latest = [...daysData].reverse().find((d) => d.count > 0);

    const sparkPoints = lastWeek
      .filter((d) => d.count > 0 && d.avg_acetone_delta != null)
      .map((d) => ({ x: d.date, y: convertFromMv(d.avg_acetone_delta!, acUnit) }));

    return { avg7, deltaPct, latest, sparkPoints };
  }, [data, acUnit]);

  return { isLoading, ...stats };
}

export function AcetoneMetricsGrid({ deviceId, bare, recentSessions }: Props) {
  const { t, locale } = useT();
  const { format: fmtAcetone, label: unitLbl } = useUnits();
  const { formatRelativeDate } = useTimezone();

  const stats = useAcetoneWeeklyMetrics(deviceId, WINDOW_DAYS);

  // Same fallback pattern as FloatingHero/HomeBentoGrid's Tile 3 — a real
  // older reading instead of a fabricated one, only for the two tiles that
  // are conceptually "the latest single reading" (not the 7-day average,
  // which a single old reading isn't).
  const fallbackSession = stats.latest ? null : recentSessions?.[0] ?? null;

  const zoneLabelKey = stats.latest?.dominant_label ?? fallbackSession?.dominant_label ?? null;
  const zone = backendLabelToZone(zoneLabelKey);
  const zoneStyle = LABEL_STYLE[zone] ?? LABEL_STYLE.unreliable;
  const zoneLabel = (locale === "th" ? LABEL_TH : LABEL_EN)[zone] ?? "—";

  const latestPeakMv = stats.latest?.max_acetone_delta ?? fallbackSession?.peak_acetone_delta ?? null;
  const fallbackAsOf = fallbackSession
    ? t("health.bento.asOf", { relative: formatRelativeDate(fallbackSession.started_at) })
    : null;

  if (stats.isLoading) {
    const skeleton = (
      <div className="grid grid-cols-2 gap-4 animate-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl p-4 bg-bg-raised h-20" />
        ))}
      </div>
    );
    return bare ? skeleton : <Card padding="lg">{skeleton}</Card>;
  }

  const grid = (
    <div className="grid grid-cols-2 gap-4">
      <Tile label={t("health.metrics.weeklyAverage")}>
        {stats.avg7 != null ? (
          <>
            <StatNumber value={fmtAcetone(stats.avg7)} unit={unitLbl} size="md" />
            {stats.sparkPoints.length >= 2 && (
              <Sparkline data={stats.sparkPoints} color={NEUTRAL_COLOR} height={32} />
            )}
          </>
        ) : (
          <EmptyValue text={t("health.metrics.noData")} />
        )}
      </Tile>

      <Tile label={t("health.metrics.currentState")}>
        {zoneLabelKey ? (
          <>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: zoneStyle.color }} />
              <span className="text-lg font-bold text-text-primary truncate">{zoneLabel}</span>
            </div>
            {!stats.latest && fallbackAsOf && (
              <p className="text-[11px] text-text-disabled">{fallbackAsOf}</p>
            )}
          </>
        ) : (
          <EmptyValue text={t("health.metrics.noData")} />
        )}
      </Tile>

      <Tile label={t("health.metrics.latestPeak")}>
        {latestPeakMv != null ? (
          <>
            <StatNumber value={fmtAcetone(latestPeakMv)} unit={unitLbl} size="md" />
            {!stats.latest && fallbackAsOf && (
              <p className="text-[11px] text-text-disabled">{fallbackAsOf}</p>
            )}
          </>
        ) : (
          <EmptyValue text={t("health.metrics.noData")} />
        )}
      </Tile>

      <Tile label={t("health.metrics.weeklyDelta")}>
        {stats.deltaPct == null ? (
          <EmptyValue text={t("health.metrics.noData")} />
        ) : (
          <div className="flex items-center gap-1 text-text-muted">
            {stats.deltaPct > 0 ? (
              <ArrowUpRight size={16} />
            ) : stats.deltaPct < 0 ? (
              <ArrowDownRight size={16} />
            ) : (
              <Minus size={16} />
            )}
            <span className="text-lg font-bold">{Math.abs(stats.deltaPct)}%</span>
            <span className="text-xs">{t("health.metrics.vsLastWeek")}</span>
          </div>
        )}
      </Tile>
    </div>
  );

  return bare ? grid : <Card padding="lg">{grid}</Card>;
}
