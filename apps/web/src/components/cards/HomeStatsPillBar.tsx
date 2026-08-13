"use client";

import { Flame, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { useUnits } from "@/lib/units";
import { convertFromMv } from "@/lib/units";
import { backendLabelToZone, LABEL_STYLE } from "@/lib/riskLabel";
import { useAcetoneWeeklyMetrics } from "@/components/cards/AcetoneMetricsGrid";
import { useBaselineQuery } from "@/components/cards/BaselineCard";

interface Props {
  deviceId: string | null | undefined;
  streakCurrent: number | undefined;
}

function Pill({
  label,
  children,
  accentColor,
}: {
  label: string;
  children: React.ReactNode;
  accentColor?: string;
}) {
  return (
    <div
      className="shrink-0 rounded-2xl border border-border-soft bg-bg-surface px-4 py-3 min-w-[108px]"
      style={accentColor ? { borderColor: `${accentColor}55` } : undefined}
    >
      <p className="text-[11px] text-text-muted font-semibold uppercase tracking-wider whitespace-nowrap">
        {label}
      </p>
      {children}
    </div>
  );
}

function PillPlaceholder({ label }: { label: string }) {
  return (
    <div className="shrink-0 rounded-2xl border border-dashed border-border-soft bg-bg-surface px-4 py-3 min-w-[108px]">
      <p className="text-[11px] text-text-muted font-semibold uppercase tracking-wider whitespace-nowrap">
        {label}
      </p>
      <p className="text-sm text-text-disabled italic mt-1">—</p>
    </div>
  );
}

/**
 * Quick-glance metrics strip under the hero — Streak / Baseline / Peak /
 * Weekly Δ. Deliberately reuses the same queries AcetoneMetricsGrid and
 * BaselineCard already run (useAcetoneWeeklyMetrics/useBaselineQuery are
 * shared hooks, same queryKey), so this adds zero new network requests.
 *
 * Peak and Weekly Δ also appear inside the Details metrics grid below —
 * that's intentional, not the redundant-CTA bug: this strip is the
 * glanceable headline, Details is the same numbers with fuller context
 * (sparkline, zone chip). No navigation/link is duplicated.
 */
export function HomeStatsPillBar({ deviceId, streakCurrent }: Props) {
  const { format: fmtAcetone, label: unitLbl, unit: acUnit } = useUnits();
  const weekly = useAcetoneWeeklyMetrics(deviceId);
  const { data: baseline } = useBaselineQuery(deviceId);

  const zone = backendLabelToZone(weekly.latest?.dominant_label);
  const zoneColor = LABEL_STYLE[zone]?.color;

  if (!deviceId) {
    return (
      <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4">
        <PillPlaceholder label="Streak" />
        <PillPlaceholder label="Baseline" />
        <PillPlaceholder label="Peak" />
        <PillPlaceholder label="Weekly Δ" />
      </div>
    );
  }

  const zero = !streakCurrent;
  const baselineValue =
    baseline && !baseline.insufficient_data && baseline.baseline_mean_mv != null
      ? convertFromMv(baseline.baseline_mean_mv, acUnit).toFixed(acUnit === "mV" ? 0 : 2)
      : null;

  return (
    <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4">
      <Pill label="Streak">
        <div className={twMerge("flex items-center gap-1 mt-1", zero ? "text-text-disabled" : "text-peach-500")}>
          <Flame size={14} className={zero ? "" : "fill-peach-500/20"} />
          <span className="text-sm font-bold tabular-nums">{streakCurrent ?? 0}</span>
        </div>
      </Pill>

      <Pill label="Baseline">
        {baselineValue != null ? (
          <p className="text-sm font-bold text-text-primary mt-1">
            {baselineValue} <span className="text-xs font-normal text-text-muted">{unitLbl}</span>
          </p>
        ) : (
          <p className="text-sm text-text-disabled italic mt-1">No data yet</p>
        )}
      </Pill>

      <Pill label="Peak" accentColor={weekly.latest ? zoneColor : undefined}>
        {weekly.latest?.max_acetone_delta != null ? (
          <p className="text-sm font-bold mt-1" style={{ color: zoneColor }}>
            {fmtAcetone(weekly.latest.max_acetone_delta)} <span className="text-xs font-normal text-text-muted">{unitLbl}</span>
          </p>
        ) : (
          <p className="text-sm text-text-disabled italic mt-1">No data yet</p>
        )}
      </Pill>

      <Pill label="Weekly Δ">
        {weekly.deltaPct == null ? (
          <p className="text-sm text-text-disabled italic mt-1">No data yet</p>
        ) : (
          // Neutral gray, deliberately not red/green — matches riskLabel.ts's
          // "not good=green/bad=red" convention and AcetoneMetricsGrid's
          // existing treatment of this same value.
          <div className="flex items-center gap-1 text-text-muted mt-1">
            {weekly.deltaPct > 0 ? (
              <ArrowUpRight size={14} />
            ) : weekly.deltaPct < 0 ? (
              <ArrowDownRight size={14} />
            ) : (
              <Minus size={14} />
            )}
            <span className="text-sm font-bold text-text-primary">{Math.abs(weekly.deltaPct)}%</span>
          </div>
        )}
      </Pill>
    </div>
  );
}
