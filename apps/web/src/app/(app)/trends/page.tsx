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
} from "recharts";
import { useState } from "react";
import { useTheme } from "next-themes";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useDeviceStream } from "@/lib/useDeviceStream";
import { convertFromMv, useUnits } from "@/lib/units";
import { useTimezone } from "@/lib/timezone";
import { parseServerTime } from "@/lib/time";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wind } from "lucide-react";
import { EmptyChartIllustration } from "@/components/brand/empty-chart";
import { TrendClassCard } from "@/components/cards/TrendClassCard";
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

const ACETONE_ZONE_COLOR: Record<string, string> = {
  low:        "#00C896",
  moderate:   "#F59E0B",
  high:       "#EF4444",
  unreliable: "#9CA3AF",
};

export default function TrendsPage() {
  const { t, locale } = useT();
  const { user } = useAuth();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const { unit: acUnit, format: fmtAcetone, label: acUnitLbl } = useUnits();
  const moderateThreshold = convertFromMv(30, acUnit);
  const highThreshold     = convertFromMv(80, acUnit);

  const acDecimals = acUnit === "mV" ? 0 : 2;
  const { formatDate: tzFormatDate, formatTime: tzFormatTime } = useTimezone();
  const [days, setDays] = useState(7);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  useDeviceStream(user?.id);

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

  const RANGES = [
    { label: "1 day",   days: 1  },
    { label: t("trends.ranges.d7"),  days: 7  },
    { label: t("trends.ranges.d30"), days: 30 },
    { label: t("trends.ranges.d90"), days: 90 },
  ];

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
    queryKey: ["sensor-readings", effectiveDevice, days],
    queryFn:  () => api.sensor.getReadings(effectiveDevice!, days),
    enabled:  !!effectiveDevice,
  });

  const { data: dailyStats } = useQuery({
    queryKey: ["daily-stats", effectiveDevice, days],
    queryFn:  () => api.sensor.getDailyStats(effectiveDevice!, days),
    enabled:  !!effectiveDevice,
    refetchInterval: 60_000,
  });

  const { data: sessions } = useQuery({
    queryKey: ["sensor", "sessions", days],
    queryFn:  () => api.sensor.getSessions(days),
    refetchInterval: 60_000,
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
                    <ReferenceLine y={moderateThreshold} stroke="#F59E0B" strokeDasharray="4 3" label={{ value: "Moderate", fontSize: 10, fill: "#B45309" }} />
                    <ReferenceLine y={highThreshold} stroke="#EF4444" strokeDasharray="4 3" label={{ value: "High", fontSize: 10, fill: "#B91C1C" }} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#00C896"
                      strokeWidth={2}
                      dot={(props) => {
                        const { cx, cy, payload } = props;
                        const color = ACETONE_ZONE_COLOR[payload.label] ?? "#9CA3AF";
                        return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill={color} stroke={isDark ? "#1F1F1F" : "white"} strokeWidth={1.5} />;
                      }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                <div className="flex gap-3 mt-3 flex-wrap">
                  {[
                    { label: "low",        color: "#00C896", text: `ต่ำ (<${moderateThreshold.toFixed(acUnit === "mV" ? 0 : 1)} ${acUnitLbl})` },
                    { label: "moderate",   color: "#F59E0B", text: `ปานกลาง (${moderateThreshold.toFixed(acUnit === "mV" ? 0 : 1)}-${highThreshold.toFixed(acUnit === "mV" ? 0 : 1)} ${acUnitLbl})` },
                    { label: "high",       color: "#EF4444", text: `สูง (>${highThreshold.toFixed(acUnit === "mV" ? 0 : 1)} ${acUnitLbl})` },
                    { label: "unreliable", color: "#9CA3AF", text: "ไม่น่าเชื่อถือ" },
                  ].map(({ label, color, text }) => (
                    <div key={label} className="flex items-center gap-1.5 text-xs text-muted">
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
                <h2 className="font-semibold text-text-primary tracking-tight">สรุปรายวัน</h2>
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
                      <th className="text-left  py-2 font-semibold">วันที่</th>
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
                      const zoneColor = ACETONE_ZONE_COLOR[d.dominant_label ?? "unreliable"] ?? "#9CA3AF";
                      return (
                        <tr key={d.date} className="border-b border-border-soft/60 hover:bg-bg-raised transition-colors">
                          <td className="py-2.5 text-text-primary font-medium">
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full shrink-0" style={{ background: zoneColor }} />
                              {new Date(d.date).toLocaleDateString(dateLocale, { day: "numeric", month: "short" })}
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
                    const zoneColor = ACETONE_ZONE_COLOR[zone] ?? "#9CA3AF";
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
