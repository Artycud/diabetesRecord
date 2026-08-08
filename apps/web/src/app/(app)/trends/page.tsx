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
import { twMerge } from "tailwind-merge";

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-3 text-muted">
      <EmptyChartIllustration className="h-16" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

function ChartSkeleton({ height = 180 }: { height?: number }) {
  return (
    <div className="animate-pulse space-y-3">
      <div className="rounded-xl bg-bg-raised" style={{ height }} />
      <div className="flex gap-4">
        <div className="h-3 bg-bg-raised rounded w-12" />
        <div className="h-3 bg-bg-raised rounded w-16" />
        <div className="h-3 bg-bg-raised rounded w-10" />
      </div>
    </div>
  );
}

// Single color source for any backend acetone label — routes both label
// vocabularies (classify_acetone's low/moderate/high AND the Anderson
// five-class basal/light_ketosis/...) through riskLabel.ts's shared
// backendLabelToZone() + LABEL_STYLE map, so dots/badges/legend here always
// match the zone colors used on Home, AcetoneZoneCard, etc. (Task D0).
function zoneColorOf(label: string | null | undefined): string {
  return LABEL_STYLE[backendLabelToZone(label)]?.color ?? "#9CA3AF";
}

export default function TrendsPage() {
  const { t, locale } = useT();
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const { unit: acUnit, format: fmtAcetone, label: acUnitLbl } = useUnits();

  const acDecimals = acUnit === "mV" ? 0 : 2;
  const { formatDate: tzFormatDate, formatTime: tzFormatTime } = useTimezone();
  const [days, setDays] = useState(7);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [showLifestyleOverlay, setShowLifestyleOverlay] = useState(true);
  useDeviceStream(user?.id);

  // ppm → the user's currently selected display unit, via the same fixed
  // mV/ppm ratio units.ts already uses for the reverse conversion.
  const ppmToUnit = (ppm: number) => convertFromMv(ppm * MV_PER_PPM, acUnit);

  // Theme-aware chart colors
  const gridColor    = isDark ? "#262626" : "#EEEDE8";
  const tickColor    = isDark ? "#7A7A7A" : "#6B6B65";
  const axisColor    = isDark ? "#2A2A2A" : "#D9D7D0";
  const tooltipStyle: React.CSSProperties = isDark
    ? { background: "#1F1F1F", border: "1px solid #262626", borderRadius: 10, fontSize: 12, color: "#FAFAFA" }
    : { background: "#FFFFFF", border: "1px solid #EEEDE8", borderRadius: 10, fontSize: 12 };

  const { data: devices } = useQuery({
    queryKey: ["devices"],
    queryFn: () => api.sensor.listDevices(),
  });
  const { data: sharedDevices } = useQuery({
    queryKey: ["shared-devices"],
    queryFn: () => api.sensor.listSharedDevices(),
    refetchInterval: 30_000,
  });
  const claimedSharedId = sharedDevices?.find((d) => d.claimed_by_me)?.id;

  // Task D4: long-term history now up to 365 days (backend cap raised from
  // 90). Daily-stats granularity auto-escalates for the longer ranges below
  // so a 1-year view renders ~12 monthly bars instead of 365 raw days.
  const RANGES = [
    { label: "1 day",   days: 1   },
    { label: t("trends.ranges.d7"),   days: 7   },
    { label: t("trends.ranges.d30"),  days: 30  },
    { label: t("trends.ranges.d90"),  days: 90  },
    { label: t("trends.ranges.d180"), days: 180 },
    { label: t("trends.ranges.d365"), days: 365 },
  ];
  const dailyStatsGranularity: DailyStatGranularity =
    days >= 180 ? "month" : days >= 90 ? "week" : "day";
  // Raw per-reading points get capped for long ranges — the acetone line
  // chart doesn't need hundreds of individual samples once daily-stats is
  // already showing sensible week/month aggregates for that span.
  const readingsLimit = days > 90 ? 500 : 0;

  const dateLocale = locale === "th" ? "th-TH" : "en-US";
  const fmt = (ts: string) => tzFormatDate(ts);

  const { data: ketone, isLoading: kLoading } = useQuery({
    queryKey: ["ketone", days],
    queryFn:  () => api.logs.getKetone({ days }),
  });

  const { data: weight, isLoading: wLoading } = useQuery({
    queryKey: ["weight", days],
    queryFn:  () => api.logs.getWeight({ days }),
  });

  // Fallback: if user has no owned device and no active shared claim, look up their
  // most recent session's device_id — backend now allows user-scoped history queries
  // on any device the user has ever recorded on.
  const { data: recentSessions } = useQuery({
    queryKey: ["sensor", "sessions", "fallback"],
    queryFn: () => api.sensor.getSessions(30),
  });
  const lastRecordedDeviceId = recentSessions?.[0]?.device_id ?? null;

  const effectiveDevice =
    selectedDevice
    ?? devices?.find((d) => d.active)?.id
    ?? devices?.[0]?.id
    ?? claimedSharedId
    ?? lastRecordedDeviceId
    ?? null;

  const { data: sensorReadings, isLoading: sLoading } = useQuery({
    queryKey: ["sensor-readings", effectiveDevice, days, readingsLimit],
    queryFn:  () => api.sensor.getReadings(effectiveDevice!, days, readingsLimit),
    enabled:  !!effectiveDevice,
  });

  const { data: dailyStats } = useQuery({
    queryKey: ["daily-stats", effectiveDevice, days, dailyStatsGranularity],
    queryFn:  () => api.sensor.getDailyStats(effectiveDevice!, days, dailyStatsGranularity),
    enabled:  !!effectiveDevice,
    refetchInterval: 60_000,
  });

  const { data: sessions } = useQuery({
    queryKey: ["sensor", "sessions", days],
    queryFn:  () => api.sensor.getSessions(days),
    refetchInterval: 60_000,
  });

  // Task D0 — Anderson five-class boundaries, the single source of truth
  // for zone/label numbers, replacing the previously hardcoded 30/80mV
  // constants that didn't actually correspond to any backend threshold.
  const { data: thresholds } = useQuery({
    queryKey: ["ai", "thresholds"],
    queryFn:  () => api.ai.getThresholds(),
    staleTime: 60 * 60 * 1000, // boundaries are effectively static
  });

  // Task D1 — personal baseline, also rendered as a reference band on the
  // acetone chart below. Same query key BaselineCard uses internally, so
  // mounting both here and via <BaselineCard/> shares one network request.
  const { data: baseline } = useQuery({
    queryKey: ["sensor", "baseline", effectiveDevice ?? "all", 30],
    queryFn:  () => api.sensor.getBaseline({ deviceId: effectiveDevice ?? undefined, days: 30 }),
    enabled:  !!effectiveDevice,
    staleTime: 5 * 60 * 1000,
  });

  // Task D5 — lifestyle correlation overlay: meal/activity logs in the same
  // window as the acetone chart. Weight reuses the `weight` query already
  // fetched above for the Weight chart.
  const { data: mealLogs } = useQuery({
    queryKey: ["logs", "meal", "overlay", days],
    queryFn:  () => api.logs.getMeal({ days }),
    enabled:  showLifestyleOverlay,
  });
  const { data: activityLogs } = useQuery({
    queryKey: ["logs", "activity", "overlay", days],
    queryFn:  () => api.logs.getActivity({ days }),
    enabled:  showLifestyleOverlay,
  });

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

      {/* Ketone chart */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-text-primary tracking-tight">{t("trends.ketoneTitle")}</h2>
              <p className="text-xs text-muted mt-0.5">mmol/L</p>
            </div>
            {ketoneData.length > 0 && (
              <Badge variant="mint">
                {t("trends.avg")}{" "}
                {(ketoneData.reduce((s, d) => s + d.value, 0) / ketoneData.length).toFixed(2)}{" "}
                mmol/L
              </Badge>
            )}
          </div>

          {kLoading ? (
            <ChartSkeleton />
          ) : ketoneData.length === 0 ? (
            <EmptyChart label={t("trends.emptyKetone")} />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={ketoneData} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: tickColor }} stroke={axisColor} />
                <YAxis domain={[0, "auto"]} tick={{ fontSize: 11, fill: tickColor }} stroke={axisColor} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} mmol/L`, t("trends.ketoneTitle")]} />
                <ReferenceLine y={0.5} stroke="#00C896" strokeDasharray="4 3" label={{ value: t("trends.ketosis"), fontSize: 10, fill: "#009B74" }} />
                <Line type="monotone" dataKey="value" stroke="#00C896" strokeWidth={2} dot={{ fill: "#00C896", r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Weight chart */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-text-primary tracking-tight">{t("trends.weightTitle")}</h2>
              <p className="text-xs text-muted mt-0.5">kg</p>
            </div>
            {weightData.length > 0 && (
              <Badge variant="peach">
                {t("trends.latest")} {weightData[weightData.length - 1].value} kg
              </Badge>
            )}
          </div>

          {wLoading ? (
            <ChartSkeleton />
          ) : weightData.length === 0 ? (
            <EmptyChart label={t("trends.emptyWeight")} />
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={weightData} margin={{ left: -20, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: tickColor }} stroke={axisColor} />
                <YAxis domain={["auto", "auto"]} tick={{ fontSize: 11, fill: tickColor }} stroke={axisColor} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} kg`, t("trends.weightTitle")]} />
                <Line type="monotone" dataKey="value" stroke="#B08D57" strokeWidth={2} dot={{ fill: "#B08D57", r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Breath Acetone history */}
      {effectiveDevice && (
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <Wind size={14} className="text-mint-500" strokeWidth={1.6} />
                  <h2 className="font-semibold text-text-primary tracking-tight">Breath Acetone</h2>
                </div>
                <p className="text-xs text-muted mt-0.5">{acUnitLbl} — TGS1820</p>
              </div>
              <div className="flex items-center gap-2">
                {acetoneData.length > 0 && (
                  <Badge variant="mint">
                    เฉลี่ย {(acetoneData.reduce((s, d) => s + d.value, 0) / acetoneData.length).toFixed(acDecimals)} {acUnitLbl}
                  </Badge>
                )}
                {overlayItems.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowLifestyleOverlay((v) => !v)}
                    aria-pressed={showLifestyleOverlay}
                    title={t("trends.overlay.toggle")}
                    className="h-7 w-7 rounded-lg flex items-center justify-center text-muted hover:text-text-primary hover:bg-bg-raised transition-colors shrink-0"
                  >
                    {showLifestyleOverlay ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                )}
                {(devices?.length ?? 0) > 1 && (
                  <select
                    value={effectiveDevice ?? ""}
                    onChange={(e) => setSelectedDevice(e.target.value || null)}
                    className="text-xs border border-border-soft rounded-lg px-2 py-1 text-text-primary bg-bg-elevated focus:outline-none"
                  >
                    {devices!.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.id.slice(0, 8)}… {d.active ? "●" : "○"}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {sLoading ? (
              <ChartSkeleton />
            ) : acetoneData.length === 0 ? (
              <EmptyChart label="ยังไม่มีข้อมูล breath acetone" />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={acetoneData} margin={{ left: -20, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: tickColor }}
                      stroke={axisColor}
                      interval={acetoneTickInterval}
                      minTickGap={60}
                    />
                    <YAxis domain={[0, "auto"]} tick={{ fontSize: 11, fill: tickColor }} stroke={axisColor} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v, _name, props) => [
                        `${v} ${acUnitLbl} (${props.payload?.label ?? ""})`,
                        "Acetone",
                      ]}
                    />
                    {/* Task D1 — personal baseline band + mean line */}
                    {baselineRangeInUnit && (
                      <ReferenceArea
                        y1={baselineRangeInUnit[0]}
                        y2={baselineRangeInUnit[1]}
                        fill="#3B82F6"
                        fillOpacity={0.08}
                        stroke="none"
                      />
                    )}
                    {baselineMeanInUnit != null && (
                      <ReferenceLine
                        y={baselineMeanInUnit}
                        stroke="#3B82F6"
                        strokeDasharray="2 2"
                        label={{ value: t("trends.baseline.title"), fontSize: 10, fill: "#3B82F6" }}
                      />
                    )}
                    {/* Task D0 — zone boundaries from GET /ai/thresholds (dynamic, not hardcoded) */}
                    {zoneBoundaries.map((b) => (
                      <ReferenceLine
                        key={b.key}
                        y={b.valueInUnit}
                        stroke={b.color}
                        strokeDasharray="4 3"
                        label={{ value: b.labelText, fontSize: 10, fill: b.color }}
                      />
                    ))}
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#00C896"
                      strokeWidth={2}
                      dot={(props) => {
                        const { cx, cy, payload } = props;
                        const color = zoneColorOf(payload.label);
                        return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={color} stroke={isDark ? "#1F1F1F" : "white"} strokeWidth={1.5} />;
                      }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>

                {/* Task D5 — lifestyle correlation overlay: meal/activity/weight
                    markers positioned proportionally across the visible window. */}
                {showLifestyleOverlay && overlayItems.length > 0 && (
                  <div className="relative h-6 mt-1 mx-2">
                    {overlayItems.map((it, i) => {
                      const ts = parseServerTime(it.ts).getTime();
                      const pct = Math.min(100, Math.max(0, ((ts - overlayRangeStart) / (overlayRangeEnd - overlayRangeStart)) * 100));
                      const style = OVERLAY_STYLE[it.kind];
                      const Icon = style.icon;
                      return (
                        <div
                          key={`${it.kind}-${it.ts}-${i}`}
                          className="group absolute top-0 -translate-x-1/2"
                          style={{ left: `${pct}%` }}
                        >
                          <div
                            className="h-4 w-4 rounded-full flex items-center justify-center cursor-default"
                            style={{ background: `${style.color}22` }}
                          >
                            <Icon size={10} style={{ color: style.color }} strokeWidth={2} />
                          </div>
                          <div
                            className="hidden group-hover:block absolute bottom-full mb-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg px-2 py-1 text-[11px] z-10 shadow-md"
                            style={tooltipStyle}
                          >
                            <span className="font-semibold">{style.label}</span>{" — "}{it.text}
                            <span className="text-muted"> · {tzFormatDate(it.ts)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex gap-3 mt-3 flex-wrap">
                  {legendZones.map(({ key, color, text }) => (
                    <div key={key} className="flex items-center gap-1.5 text-xs text-muted">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                      {text}
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Daily stats table */}
      {effectiveDevice && (
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-semibold text-text-primary tracking-tight">
                  สรุป{t(`trends.granularity.${dailyStatsGranularity}`)}
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  {days === 1 ? "วันนี้" : `${days} วันล่าสุด`} · หน่วย acetone: {acUnitLbl}
                </p>
              </div>
              {(dailyStats?.length ?? 0) > 0 && (
                <Badge variant="mint">
                  รวม {dailyStats!.reduce((s, d) => s + d.count, 0)} ครั้ง
                </Badge>
              )}
            </div>
            {(dailyStats?.length ?? 0) === 0 && (
              <EmptyChart label="ยังไม่มีการเป่าในช่วงนี้" />
            )}
            {(dailyStats?.length ?? 0) > 0 && (
              <div className="overflow-x-auto -mx-4 px-4">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border-soft text-muted">
                      <th className="text-left  py-2 font-semibold">
                        {dailyStatsGranularity === "day" ? "วันที่" : dailyStatsGranularity === "week" ? "สัปดาห์ของ" : "เดือน"}
                      </th>
                      <th className="text-right py-2 font-semibold">ครั้ง</th>
                      <th className="text-right py-2 font-semibold">เฉลี่ย</th>
                      <th className="text-right py-2 font-semibold">สูงสุด</th>
                      {hasTemp     && <th className="text-right py-2 font-semibold">อุณหภูมิ</th>}
                      {hasHumidity && <th className="text-right py-2 font-semibold">ความชื้น</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {dailyStats!.map((d) => {
                      const avg = d.avg_acetone_delta;
                      const max = d.max_acetone_delta;
                      const zoneColor = zoneColorOf(d.dominant_label);
                      const dateFmtOpts: Intl.DateTimeFormatOptions =
                        dailyStatsGranularity === "month"
                          ? { month: "short", year: "numeric" }
                          : { day: "numeric", month: "short" };
                      return (
                        <tr key={d.date} className="border-b border-border-soft/60 hover:bg-bg-raised transition-colors">
                          <td className="py-2.5 text-text-primary font-medium">
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: zoneColor }} />
                              {new Date(d.date).toLocaleDateString(dateLocale, dateFmtOpts)}
                            </div>
                          </td>
                          <td className="py-2.5 text-right text-text-primary font-mono">{d.count}</td>
                          <td className="py-2.5 text-right text-text-primary font-mono font-semibold">
                            {avg != null ? convertFromMv(avg, acUnit).toFixed(acDecimals) : "—"}
                          </td>
                          <td className="py-2.5 text-right text-muted font-mono">
                            {max != null ? convertFromMv(max, acUnit).toFixed(acDecimals) : "—"}
                          </td>
                          {hasTemp && (
                            <td className="py-2.5 text-right text-muted font-mono">
                              {d.avg_temp_c != null ? `${d.avg_temp_c.toFixed(1)}°C` : "—"}
                            </td>
                          )}
                          {hasHumidity && (
                            <td className="py-2.5 text-right text-muted font-mono">
                              {d.avg_humidity_pct != null ? `${d.avg_humidity_pct.toFixed(0)}%` : "—"}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Per-session summary */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-semibold text-text-primary tracking-tight">สรุปรายครั้ง</h2>
              <p className="text-xs text-muted mt-0.5">
                แต่ละครั้งที่กด START · {days === 1 ? "วันนี้" : `${days} วันล่าสุด`}
              </p>
            </div>
            {(sessions?.length ?? 0) > 0 && (
              <Badge variant="mint">รวม {sessions!.length} ครั้ง</Badge>
            )}
          </div>

          {(sessions?.length ?? 0) === 0 && (
            <EmptyChart label="ยังไม่มี session การเป่าในช่วงนี้" />
          )}

          {(sessions?.length ?? 0) > 0 && (
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border-soft text-muted">
                    <th className="text-left  py-2 font-semibold">เวลา</th>
                    <th className="text-right py-2 font-semibold">น</th>
                    <th className="text-right py-2 font-semibold">เฉลี่ย</th>
                    <th className="text-right py-2 font-semibold">สูงสุด</th>
                    <th className="text-right py-2 font-semibold">แรงเป่า</th>
                    <th className="text-right py-2 font-semibold">ระดับ</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions!.map((s) => {
                    const zone = s.dominant_label ?? "unreliable";
                    const zoneColor = zoneColorOf(zone);
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
