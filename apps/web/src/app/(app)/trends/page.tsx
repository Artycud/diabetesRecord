"use client";

import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
} from "recharts";
import { useMemo, useState } from "react";
import { useTheme } from "next-themes";
import { api, type DailyStatGranularity } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useDeviceStream } from "@/lib/useDeviceStream";
import { convertFromMv, MV_PER_PPM, useUnits } from "@/lib/units";
import { useTimezone } from "@/lib/timezone";
import { parseServerTime } from "@/lib/time";
import { backendLabelToZone, LABEL_STYLE, LABEL_TH } from "@/lib/riskLabel";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wind, Utensils, Dumbbell, Scale, Eye, EyeOff } from "lucide-react";
import { EmptyChartIllustration } from "@/components/brand/empty-chart";
import { TrendClassCard } from "@/components/cards/TrendClassCard";
import { BaselineCard } from "@/components/cards/BaselineCard";
import { AiInterpretCard } from "@/components/cards/AiInterpretCard";
  const ketoneData = (ketone ?? []).map((k) => ({
    date:  fmt(k.ts),
    value: +k.value_mmol.toFixed(2),
  }));

  const acetoneData = (sensorReadings ?? [])
    .filter((r) => r.acetone_delta !== null)
    .map((r) => ({
      date:    fmt(r.time),
      value:   +convertFromMv(r.acetone_delta!, acUnit).toFixed(2),
      label:   r.label ?? "unreliable",
      quality: r.quality_score ?? 0,
    }));

  // Deduplicate X-axis labels by sampling — show at most ~8 ticks
  const acetoneTickInterval = acetoneData.length > 8
    ? Math.floor(acetoneData.length / 8)
    : 0;

  const weightData = (weight ?? []).map((w) => ({
    date:  fmt(w.ts),
    value: +w.kg.toFixed(1),
  }));

  // Only show temp/humidity columns when sensor actually provides that data
  const hasTemp     = (dailyStats ?? []).some(d => d.avg_temp_c != null);
  const hasHumidity = (dailyStats ?? []).some(d => d.avg_humidity_pct != null);

  // Task D0 — zone boundaries (chart reference lines) derived from
  // GET /ai/thresholds, one per Anderson five-class boundary, colored via
  // the same backendLabelToZone()/LABEL_STYLE map used app-wide.
  const zoneBoundaries = useMemo(() => {
    const classes = thresholds?.anderson_five_class ?? [];
    const out: { key: string; valueInUnit: number; color: string; labelText: string }[] = [];
    for (let i = 0; i < classes.length - 1; i++) {
      const boundaryPpm = classes[i].upper_bound_ppm;
      if (boundaryPpm == null) continue;
      const enterZone = backendLabelToZone(classes[i + 1].label);
      out.push({
        key: classes[i + 1].label,
        valueInUnit: ppmToUnit(boundaryPpm),
        color: LABEL_STYLE[enterZone]?.color ?? "#9CA3AF",
        labelText: LABEL_TH[enterZone] ?? enterZone,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thresholds, acUnit]);

  // Same boundary list, formatted into the legend row below the chart —
  // one swatch per zone (including the "below the first boundary" zone and
  // "unreliable"), replacing the previously hardcoded 4-item legend array.
  const legendZones = useMemo(() => {
    const classes = thresholds?.anderson_five_class ?? [];
    const fmtB = (ppm: number) => ppmToUnit(ppm).toFixed(acUnit === "mV" ? 0 : 1);
    const items: { key: string; color: string; text: string }[] = [];
    if (classes.length > 0 && classes[0].upper_bound_ppm != null) {
      const zone = backendLabelToZone(classes[0].label);
      items.push({
        key: zone,
        color: LABEL_STYLE[zone]?.color ?? "#9CA3AF",
        text: `${LABEL_TH[zone] ?? zone} (<${fmtB(classes[0].upper_bound_ppm)} ${acUnitLbl})`,
      });
    }
    for (let i = 0; i < classes.length - 1; i++) {
      const lo = classes[i].upper_bound_ppm;
      if (lo == null) continue;
      const hiClass = classes[i + 1];
      const zone = backendLabelToZone(hiClass.label);
      const text = hiClass.upper_bound_ppm != null
        ? `${LABEL_TH[zone] ?? zone} (${fmtB(lo)}-${fmtB(hiClass.upper_bound_ppm)} ${acUnitLbl})`
        : `${LABEL_TH[zone] ?? zone} (>${fmtB(lo)} ${acUnitLbl})`;
      items.push({ key: zone, color: LABEL_STYLE[zone]?.color ?? "#9CA3AF", text });
    }
    items.push({ key: "unreliable", color: LABEL_STYLE.unreliable.color, text: LABEL_TH.unreliable });
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thresholds, acUnit]);

  // Task D1 — baseline band for the acetone chart (only once there's
  // enough history; `insufficient_data` readings are all-null so this
  // naturally no-ops until then).
  const baselineRangeInUnit: [number, number] | null =
    !baseline || baseline.insufficient_data || !baseline.baseline_range_mv
      ? null
      : [convertFromMv(baseline.baseline_range_mv[0], acUnit), convertFromMv(baseline.baseline_range_mv[1], acUnit)];
  const baselineMeanInUnit =
    !baseline || baseline.insufficient_data || baseline.baseline_mean_mv == null
      ? null
      : convertFromMv(baseline.baseline_mean_mv, acUnit);

  // Task D5 — lifestyle correlation overlay: meal/activity/weight log
  // markers within the visible [now-days, now] window, positioned by
  // percentage along that span rather than tied to the chart's categorical
  // x-axis (reading timestamps rarely line up exactly with log timestamps).
  const overlayRangeEnd = Date.now();
  const overlayRangeStart = overlayRangeEnd - days * 24 * 60 * 60 * 1000;
  type OverlayItem = { ts: string; kind: "meal" | "activity" | "weight"; text: string };
  const overlayItems = useMemo(() => {
    if (!showLifestyleOverlay) return [];
    const items: OverlayItem[] = [];
    (mealLogs ?? []).forEach((m) => items.push({ ts: m.ts, kind: "meal", text: m.name }));
    (activityLogs ?? []).forEach((a) =>
      items.push({ ts: a.ts, kind: "activity", text: `${a.kind} · ${a.duration_min} min` })
    );
    (weight ?? []).forEach((w) => items.push({ ts: w.ts, kind: "weight", text: `${w.kg} kg` }));
    return items
      .filter((it) => {
        const t2 = parseServerTime(it.ts).getTime();
        return t2 >= overlayRangeStart && t2 <= overlayRangeEnd;
      })
      .sort((a, b) => parseServerTime(b.ts).getTime() - parseServerTime(a.ts).getTime())
      .slice(0, 60); // cap so a busy log history never floods the strip
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLifestyleOverlay, mealLogs, activityLogs, weight, overlayRangeStart, overlayRangeEnd]);

  const OVERLAY_STYLE: Record<OverlayItem["kind"], { icon: typeof Utensils; color: string; label: string }> = {
    meal:     { icon: Utensils, color: "#F59E0B", label: t("trends.overlay.meal") },
    activity: { icon: Dumbbell, color: "#3B82F6", label: t("trends.overlay.activity") },
    weight:   { icon: Scale,    color: "#B08D57", label: t("trends.overlay.weight") },
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-12 md:pt-6 pb-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary tracking-tight">{t("trends.title")}</h1>
        <div className="mt-3 inline-flex gap-1 rounded-xl bg-bg-elevated border border-border-soft p-1">
          {RANGES.map(({ label, days: d }) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={twMerge(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-all",
                days === d
                  ? "bg-bg-raised text-mint-500 shadow-sm"
                  : "text-muted hover:text-text-primary"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Long-term trend classifier (Phase 3 LSTM Trend) */}
      {effectiveDevice && <TrendClassCard deviceId={effectiveDevice} sessions={14} />}

      {/* Personal baseline (Task D1) — "your own normal" alongside the
          population Anderson zones shown further down on the acetone chart. */}
      {effectiveDevice && <BaselineCard deviceId={effectiveDevice} />}

      {/* AI interpretation of the latest reading vs. personal baseline (Task D2) */}
      {effectiveDevice && <AiInterpretCard deviceId={effectiveDevice} />}

                    return (
                      <tr
                        key={s.session_id}
                        className="border-b border-border-soft/60 hover:bg-bg-raised transition-colors"
                      >
                        <td className="py-2.5 text-text-primary font-medium">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="h-2 w-2 rounded-full shrink-0"
                              style={{ background: zoneColor }}
                            />
                            <div className="leading-tight">
                              <div>{tzFormatDate(s.started_at)}</div>
                              <div className="text-[10px] text-muted">
                                {tzFormatTime(s.started_at)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 text-right text-text-primary font-mono">
                          {s.n_samples}
                        </td>
                        <td className="py-2.5 text-right text-text-primary font-mono font-semibold">
                          {s.mean_acetone_delta != null
                            ? convertFromMv(s.mean_acetone_delta, acUnit).toFixed(acDecimals)
                            : "—"}
                        </td>
                        <td className="py-2.5 text-right text-muted font-mono">
                          {s.peak_acetone_delta != null
                            ? convertFromMv(s.peak_acetone_delta, acUnit).toFixed(acDecimals)
                            : "—"}
                        </td>
                        <td className="py-2.5 text-right text-muted font-mono">
                          {s.avg_pressure_kpa != null
                            ? `${s.avg_pressure_kpa.toFixed(1)}`
                            : "—"}
                        </td>
                        <td className="py-2.5 text-right">
                          <span
                            className="inline-block text-[10px] font-medium px-2 py-0.5 rounded-full"
                            style={{
                              background: `${zoneColor}22`,
                              color: zoneColor,
                            }}
                          >
                            {zone}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
