"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import type { DashboardReading } from "@/lib/api";

/**
 * Acetone-over-time chart for a single patient — extracted out of the admin
 * per-user dashboard so both that page and a doctor's view of an assigned
 * patient (/doctor/patient/[id]) render one identical chart from the same
 * UserDashboardOut.series shape, rather than two implementations that can
 * visually drift apart. Uses the app's theme tokens (not hardcoded hex) so
 * it renders correctly in both light and dark mode.
 */
export function PatientAcetoneChart({
  series,
  loading,
  days,
}: {
  series: DashboardReading[];
  loading: boolean;
  days: number;
}) {
  const chartData = useMemo(
    () =>
      series.map((r) => ({
        t: new Date(r.time).getTime(),
        acetone: r.acetone_delta,
        quality: r.quality_score,
        label: r.label,
      })),
    [series],
  );

  return (
    <div className="rounded-2xl bg-bg-surface border border-border-soft p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-text-primary text-sm">Acetone Δ ตามเวลา</h2>
          <p className="text-xs text-text-disabled mt-0.5">
            {loading ? "" : `${chartData.length} จุด (downsampled)`}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 bg-mint-600 rounded" /> acetone_delta
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 border-t border-dashed border-warning" /> 30 mV
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-0.5 border-t border-dashed border-danger" /> 80 mV
          </span>
        </div>
      </div>

      <div className="h-72 w-full">
        {loading ? (
          <div className="w-full h-full bg-bg-elevated rounded-xl animate-pulse" />
        ) : chartData.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center text-sm text-text-disabled">
            ไม่มีข้อมูลในช่วง {days} วันที่ผ่านมา
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-soft)" />
              <XAxis
                dataKey="t"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(v) => {
                  const d = new Date(v);
                  return days <= 1
                    ? d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })
                    : d.toLocaleDateString("th-TH", { month: "short", day: "numeric" });
                }}
                tick={{ fontSize: 11, fill: "var(--color-text-disabled)" }}
                stroke="var(--color-border-soft)"
              />
              <YAxis
                tick={{ fontSize: 11, fill: "var(--color-text-disabled)" }}
                stroke="var(--color-border-soft)"
                label={{ value: "mV", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "var(--color-text-disabled)" } }}
              />
              <Tooltip
                labelFormatter={(v) => new Date(v as number).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                formatter={(v) => {
                  if (typeof v !== "number") return ["—", "Acetone Δ"];
                  return [`${v.toFixed(2)} mV`, "Acetone Δ"];
                }}
                contentStyle={{
                  borderRadius: 8, border: "1px solid var(--color-border-soft)", fontSize: 12,
                  background: "var(--color-bg-surface)", color: "var(--color-text-primary)",
                }}
              />
              <ReferenceLine y={30} stroke="var(--color-warning)" strokeDasharray="4 4" />
              <ReferenceLine y={80} stroke="var(--color-danger)" strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="acetone"
                stroke="var(--color-mint-600)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
