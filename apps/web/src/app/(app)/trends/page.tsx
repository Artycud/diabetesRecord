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
import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { api, type DailyStatGranularity } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useDeviceStream } from "@/lib/useDeviceStream";
import { convertFromMv, MV_PER_PPM, useUnits } from "@/lib/units";
import { useTimezone } from "@/lib/timezone";
import { parseServerTime } from "@/lib/time";
import { backendLabelToZone, LABEL_STYLE, LABEL_TH } from "@/lib/riskLabel";
import { Badge } from "@/components/ui/badge";
import { Wind, Utensils, Dumbbell, Eye, EyeOff, ChevronDown, CalendarDays, ListChecks } from "lucide-react";
import { EmptyChartIllustration } from "@/components/brand/empty-chart";
import { TrendClassCard } from "@/components/cards/TrendClassCard";
import { BaselineCard } from "@/components/cards/BaselineCard";
import { AiInterpretCard } from "@/components/cards/AiInterpretCard";
import { TrendMetricCard } from "@/components/cards/TrendMetricCard";
import { KetoneConnectCta } from "@/components/cards/KetoneConnectCta";
import { HistoryRow } from "@/components/cards/HistoryRow";
import { DetailsSection } from "@/components/ui/DetailsSection";
import { BentoTile } from "@/components/ui/BentoTile";
import { twMerge } from "tailwind-merge";

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-3 text-text-muted">
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
  // Off by default — the feature stays available but shouldn't compete with
  // the chart itself on first view (see the Eye/EyeOff toggle below).
  const [showLifestyleOverlay, setShowLifestyleOverlay] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
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
    { label: t("trends.ranges.d1"),   days: 1   },
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

  // Post-breath-check reveal: once a check completes on /breathing,
  // BreathSession's finalize() arms this flag so the next Trends load
  // scrolls straight to the freshly-updated Breath Acetone chart.
  const acetoneChartRef = useRef<HTMLDivElement>(null);
  const revealConsumed = useRef(false);
  useEffect(() => {
    if (!effectiveDevice || revealConsumed.current) return;
    let raw: string | null = null;
    try { raw = sessionStorage.getItem("mb:justChecked:trends"); } catch {}
    if (!raw) return;
    revealConsumed.current = true;
    try { sessionStorage.removeItem("mb:justChecked:trends"); } catch {}
    const FRESH_WINDOW_MS = 5 * 60 * 1000;
    if (Date.now() - Number(raw) > FRESH_WINDOW_MS) return;
    const id = setTimeout(() => {
      acetoneChartRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 400);
    return () => clearTimeout(id);
  }, [effectiveDevice]);

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
  // window as the acetone chart.
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

  // The 5-zone palette is the app's core visual identity (see Home's hero
  // and AcetoneZoneCard) — the line itself now tracks the latest reading's
  // zone color too, not just its per-point dots, so the chart's accent
  // color always means the same thing it does everywhere else.
  const latestAcetoneZoneColor = acetoneData.length > 0 ? zoneColorOf(acetoneData.at(-1)!.label) : "#00C896";

  // Deduplicate X-axis labels by sampling — show at most ~8 ticks
  const acetoneTickInterval = acetoneData.length > 8
    ? Math.floor(acetoneData.length / 8)
    : 0;

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

  // Task D5 — lifestyle correlation overlay: meal/activity log markers
  // within the visible [now-days, now] window, positioned by percentage
  // along that span rather than tied to the chart's categorical x-axis
  // (reading timestamps rarely line up exactly with log timestamps).
  const overlayRangeEnd = Date.now();
  const overlayRangeStart = overlayRangeEnd - days * 24 * 60 * 60 * 1000;
  type OverlayItem = { ts: string; kind: "meal" | "activity"; text: string };
  const overlayItems = useMemo(() => {
    if (!showLifestyleOverlay) return [];
    const items: OverlayItem[] = [];
    (mealLogs ?? []).forEach((m) => items.push({ ts: m.ts, kind: "meal", text: m.name }));
    (activityLogs ?? []).forEach((a) =>
      items.push({ ts: a.ts, kind: "activity", text: `${a.kind} · ${a.duration_min} min` })
    );
    return items
      .filter((it) => {
        const t2 = parseServerTime(it.ts).getTime();
        return t2 >= overlayRangeStart && t2 <= overlayRangeEnd;
      })
      .sort((a, b) => parseServerTime(b.ts).getTime() - parseServerTime(a.ts).getTime())
      .slice(0, 60); // cap so a busy log history never floods the strip
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLifestyleOverlay, mealLogs, activityLogs, overlayRangeStart, overlayRangeEnd]);

  const OVERLAY_STYLE: Record<OverlayItem["kind"], { icon: typeof Utensils; color: string; label: string }> = {
    meal:     { icon: Utensils, color: "#F59E0B", label: t("trends.overlay.meal") },
    activity: { icon: Dumbbell, color: "#3B82F6", label: t("trends.overlay.activity") },
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pt-5 pb-tabbar space-y-5">
      <div>
        <p className="text-xs text-mint-500 font-semibold uppercase tracking-widest">{t("trends.eyebrow")}</p>
        <h1 className="text-2xl font-bold text-text-primary tracking-tight mt-0.5">{t("trends.title")}</h1>
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

      {/* Breath Acetone history — the primary hero chart: automated hardware
          data leads the page, ahead of interpretive detail and the manual
          ketone entry below. */}
      {effectiveDevice && (
        <div ref={acetoneChartRef}>
        <TrendMetricCard
          icon={<Wind size={14} className="text-mint-500" strokeWidth={1.6} />}
          title="Breath Acetone"
          unit={acUnitLbl}
          valueLabel={t("trends.avg")}
          value={acetoneData.length > 0 ? (acetoneData.reduce((s, d) => s + d.value, 0) / acetoneData.length).toFixed(acDecimals) : null}
          actions={
            <>
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
            </>
          }
        >
            {sLoading ? (
              <ChartSkeleton />
            ) : acetoneData.length === 0 ? (
              <EmptyChart label={t("trends.empty")} />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={acetoneData} margin={{ left: -20, right: 8 }}>
                    <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={gridColor} />
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
                      stroke={latestAcetoneZoneColor}
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

                {/* Task D5 — lifestyle correlation overlay: meal/activity
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

                <button
                  type="button"
                  onClick={() => setLegendOpen((v) => !v)}
                  className="flex items-center gap-1 mt-3 text-xs text-mint-500 font-medium"
                >
                  Zone details
                  <ChevronDown size={12} className={twMerge("transition-transform duration-200", legendOpen && "rotate-180")} />
                </button>
                {legendOpen && (
                  <div className="flex gap-3 mt-2 flex-wrap animate-fade-rise-in">
                    {legendZones.map(({ key, color, text }) => (
                      <div key={key} className="flex items-center gap-1.5 text-xs text-muted">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                        {text}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
        </TrendMetricCard>
        </div>
      )}

      {/* Interpretive detail — trend classification, personal baseline, and
          the AI take are the most valuable analysis on this screen, so it's
          open by default rather than making users dig for it. */}
      {effectiveDevice && (
        <DetailsSection title={t("trends.details")} defaultOpen>
          <BentoTile><TrendClassCard deviceId={effectiveDevice} sessions={14} bare /></BentoTile>
          <BentoTile><BaselineCard deviceId={effectiveDevice} bare /></BentoTile>
          <AiInterpretCard
            deviceId={effectiveDevice}
            questions={["ทำไมแนวโน้มของฉันถึงเป็นแบบนี้?", "ควรปรับอะไรต่อไป?"]}
          />
        </DetailsSection>
      )}

      {/* Daily stats table */}
      {effectiveDevice && (
        <TrendMetricCard
          icon={<CalendarDays size={14} className="text-mint-500" strokeWidth={1.6} />}
          title={`สรุป${t(`trends.granularity.${dailyStatsGranularity}`)}`}
          subtitle={`${days === 1 ? "วันนี้" : `${days} วันล่าสุด`} · หน่วย acetone: ${acUnitLbl}`}
          actions={(dailyStats?.length ?? 0) > 0 && (
            <Badge variant="mint">
              รวม {dailyStats!.reduce((s, d) => s + d.count, 0)} ครั้ง
            </Badge>
          )}
        >
          {(dailyStats?.length ?? 0) === 0 && (
            <EmptyChart label={t("trends.empty")} />
          )}
          {(dailyStats?.length ?? 0) > 0 && (
            <div className="-mx-2 space-y-0.5">
              {dailyStats!.map((d) => {
                const avg = d.avg_acetone_delta;
                const max = d.max_acetone_delta;
                const zoneColor = zoneColorOf(d.dominant_label);
                const dateFmtOpts: Intl.DateTimeFormatOptions =
                  dailyStatsGranularity === "month"
                    ? { month: "short", year: "numeric" }
                    : { day: "numeric", month: "short" };
                const envBits = [
                  hasTemp && d.avg_temp_c != null ? `${d.avg_temp_c.toFixed(1)}°C` : null,
                  hasHumidity && d.avg_humidity_pct != null ? `${d.avg_humidity_pct.toFixed(0)}%` : null,
                ].filter(Boolean);
                return (
                  <HistoryRow
                    key={d.date}
                    leadingColor={zoneColor}
                    title={new Date(d.date).toLocaleDateString(dateLocale, dateFmtOpts)}
                    subtitle={`${d.count} ครั้ง${envBits.length ? " · " + envBits.join(" · ") : ""}`}
                    primary={avg != null ? `${convertFromMv(avg, acUnit).toFixed(acDecimals)} ${acUnitLbl}` : "—"}
                    secondary={max != null ? `สูงสุด ${convertFromMv(max, acUnit).toFixed(acDecimals)} ${acUnitLbl}` : undefined}
                  />
                );
              })}
            </div>
          )}
        </TrendMetricCard>
      )}

      {/* Per-session summary */}
      <TrendMetricCard
        icon={<ListChecks size={14} className="text-mint-500" strokeWidth={1.6} />}
        title="สรุปรายครั้ง"
        subtitle={`แต่ละครั้งที่กด START · ${days === 1 ? "วันนี้" : `${days} วันล่าสุด`}`}
        actions={(sessions?.length ?? 0) > 0 && (
          <Badge variant="mint">รวม {sessions!.length} ครั้ง</Badge>
        )}
      >
        {(sessions?.length ?? 0) === 0 && (
          <EmptyChart label={t("trends.empty")} />
        )}

        {(sessions?.length ?? 0) > 0 && (
          <div className="-mx-2 space-y-0.5">
            {sessions!.map((s) => {
              const zone = s.dominant_label ?? "unreliable";
              const zoneColor = zoneColorOf(zone);
              return (
                <HistoryRow
                  key={s.session_id}
                  leadingColor={zoneColor}
                  title={tzFormatDate(s.started_at)}
                  subtitle={`${tzFormatTime(s.started_at)} · ${s.n_samples} น. · ${zone}`}
                  primary={
                    s.mean_acetone_delta != null
                      ? `${convertFromMv(s.mean_acetone_delta, acUnit).toFixed(acDecimals)} ${acUnitLbl}`
                      : "—"
                  }
                  secondary={
                    s.peak_acetone_delta != null
                      ? `สูงสุด ${convertFromMv(s.peak_acetone_delta, acUnit).toFixed(acDecimals)} ${acUnitLbl}`
                      : undefined
                  }
                />
              );
            })}
          </div>
        )}
      </TrendMetricCard>

      {/* Ketone chart — manual lab entry, deprioritized to the very bottom of
          the page. Blood/urine ketone values require a manual entry and are
          commonly empty, so the empty case collapses into a minimal
          "Connect Lab Data" CTA instead of a broken/gray chart placeholder. */}
      <TrendMetricCard
        title={t("trends.ketoneTitle")}
        unit="mmol/L"
        valueLabel={t("trends.avg")}
        value={ketoneData.length > 0 ? (ketoneData.reduce((s, d) => s + d.value, 0) / ketoneData.length).toFixed(2) : null}
      >
        {kLoading ? (
          <ChartSkeleton />
        ) : ketoneData.length === 0 ? (
          <KetoneConnectCta href="/log?tab=ketone" />
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={ketoneData} margin={{ left: -20, right: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: tickColor }} stroke={axisColor} />
              <YAxis domain={[0, "auto"]} tick={{ fontSize: 11, fill: tickColor }} stroke={axisColor} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} mmol/L`, t("trends.ketoneTitle")]} />
              <ReferenceLine y={0.5} stroke="#00C896" strokeDasharray="4 3" label={{ value: t("trends.ketosis"), fontSize: 10, fill: "#009B74" }} />
              <Line type="monotone" dataKey="value" stroke="#00C896" strokeWidth={2} dot={{ fill: "#00C896", r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </TrendMetricCard>
    </div>
  );
}
