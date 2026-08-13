"use client";

import { useQuery } from "@tanstack/react-query";
import { twMerge } from "tailwind-merge";
import { Gauge } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { convertFromMv, useUnits } from "@/lib/units";
import { Card, CardContent } from "@/components/ui/card";

/**
 * BaselineCard — surfaces GET /sensor/baseline (Task D1): the user's own
 * trimmed mean + range computed from their own reading history, shown
 * alongside the fixed population Anderson thresholds so "your baseline" and
 * "the general zone chart" read as two distinct, clearly-labeled things.
 *
 * Handles `insufficient_data: true` as a real, friendly empty state (not an
 * error) — expected for fresh accounts / demo users with little history yet.
 */
interface Props {
  deviceId?: string | null;
  days?: number;
  className?: string;
  /** Skip the outer Card chrome — for when a parent (Home's unified Details
   *  container) already supplies the card border/background/padding. */
  bare?: boolean;
}

/** Shared by BaselineCard and HomeStatsPillBar — same queryKey as before
 *  extraction, so both callers share one TanStack Query cache entry. */
export function useBaselineQuery(deviceId?: string | null, days = 30) {
  return useQuery({
    queryKey: ["sensor", "baseline", deviceId ?? "all", days],
    queryFn: () => api.sensor.getBaseline({ deviceId: deviceId ?? undefined, days }),
    staleTime: 5 * 60 * 1000,
  });
}

export function BaselineCard({ deviceId, days = 30, className, bare }: Props) {
  const { t } = useT();
  const { unit: acUnit, label: acUnitLbl } = useUnits();
  const acDecimals = acUnit === "mV" ? 0 : 2;

  const { data, isLoading, isError } = useBaselineQuery(deviceId, days);

  if (isLoading) {
    const skeleton = (
      <div className="animate-pulse">
        <div className="h-3 w-24 rounded bg-bg-raised" />
        <div className="mt-3 h-7 w-32 rounded bg-bg-raised" />
        <div className="mt-2 h-3 w-40 rounded bg-bg-raised" />
      </div>
    );
    return bare ? <div className={className}>{skeleton}</div> : (
      <Card className={className}><CardContent>{skeleton}</CardContent></Card>
    );
  }

  if (isError || !data) {
    return null; // non-critical widget — fail quietly rather than blocking the page
  }

  const body = data.insufficient_data ? (
    <div className="flex items-start gap-3">
      <div className="h-9 w-9 rounded-xl bg-bg-raised flex items-center justify-center shrink-0">
        <Gauge size={16} className="text-text-muted" strokeWidth={1.6} />
      </div>
      <div>
        <p className="text-sm font-semibold text-text-primary">
          {t("trends.baseline.insufficientTitle")}
        </p>
        <p className="text-xs text-text-muted mt-0.5 leading-relaxed">
          {t("trends.baseline.insufficientDesc")}
        </p>
      </div>
    </div>
  ) : (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-mint-500/10 flex items-center justify-center shrink-0">
          <Gauge size={16} className="text-mint-500" strokeWidth={1.6} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-text-muted">
            {t("trends.baseline.title")}
          </p>
          <p className="text-lg font-semibold text-text-primary mt-0.5">
            {data.baseline_mean_mv != null ? convertFromMv(data.baseline_mean_mv, acUnit).toFixed(acDecimals) : "—"}{" "}
            <span className="text-xs font-normal text-text-muted">{acUnitLbl}</span>
          </p>
          {data.baseline_range_mv && (
            <p className="text-xs text-text-muted mt-0.5">
              {t("trends.baseline.range")}: {convertFromMv(data.baseline_range_mv[0], acUnit).toFixed(acDecimals)}
              {"–"}
              {convertFromMv(data.baseline_range_mv[1], acUnit).toFixed(acDecimals)} {acUnitLbl}
            </p>
          )}
          <p className="text-[11px] text-text-disabled mt-1">
            {t("trends.baseline.basedOn", { n: data.sample_count, days: data.computed_from_days })}
          </p>
        </div>
      </div>
    </div>
  );

  return bare ? <div className={className}>{body}</div> : (
    <Card className={className}><CardContent>{body}</CardContent></Card>
  );
}
