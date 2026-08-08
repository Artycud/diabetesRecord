"use client";

import { flexScoreStyle } from "@/lib/riskLabel";
import type { FlexibilityResponse } from "@/lib/api";

interface Props {
  data: FlexibilityResponse | null | undefined;
  loading?: boolean;
  hasDevice?: boolean;
}

export function FlexibilityBar({ data, loading, hasDevice = true }: Props) {
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse">
        <div className="flex justify-between items-end">
          <div className="h-8 w-16 bg-bg-raised rounded-lg" />
          <div className="h-4 w-24 bg-bg-raised rounded" />
        </div>
        <div className="h-3 w-full bg-bg-raised rounded-full" />
        <div className="h-4 w-48 bg-bg-raised rounded" />
      </div>
    );
  }

  if (!hasDevice) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
        <span className="text-3xl">🫁</span>
        <p className="text-sm font-medium text-text-muted">ยังไม่ได้เชื่อมต่ออุปกรณ์</p>
        <p className="text-xs text-text-disabled">เชื่อมต่อ MetaBreath เพื่อเริ่มวัด Metabolic Flexibility</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-end">
          <span className="text-4xl font-bold text-text-disabled">—</span>
          <span className="text-xs text-text-muted uppercase tracking-widest">Flex Score</span>
        </div>
        <div className="relative h-3 w-full bg-bg-raised rounded-full overflow-hidden" />
        <p className="text-xs text-text-muted">วัดอย่างน้อย 3 ครั้งเพื่อดู Flexibility Score</p>
      </div>
    );
  }

  const { score, breakdown, trend, message_th, n_sessions } = data;
  const style = flexScoreStyle(score);
  const trendIcon = trend === "increasing" ? "↑" : trend === "decreasing" ? "↓" : trend === "insufficient_data" ? "—" : "→";

  return (
    <div className="space-y-3">
      {/* Score + trend */}
      <div className="flex justify-between items-end">
        <div className="flex items-end gap-2">
          <span className="text-4xl font-bold leading-none" style={{ color: style.color }}>
            {score}
          </span>
          <span className="text-lg text-text-muted mb-0.5">/100</span>
        </div>
        <div className="text-right">
          <span className="text-xs font-semibold uppercase tracking-widest text-text-muted">Flex Score</span>
          <div className="flex items-center justify-end gap-1 mt-0.5">
            <span className="text-sm font-semibold" style={{ color: style.color }}>{style.label}</span>
            <span className="text-sm text-text-muted">{trendIcon}</span>
          </div>
        </div>
      </div>

      {/* Main bar */}
      <div className="relative h-3 w-full bg-bg-raised rounded-full overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{
            width: `${score}%`,
            background: `linear-gradient(to right, ${style.color}88, ${style.color})`,
          }}
        />
      </div>

      {/* Breakdown sub-bars */}
      <div className="grid grid-cols-3 gap-2">
        <SubBar label="Amplitude" value={breakdown.amplitude} max={40} color={style.color} />
        <SubBar label="Return" value={breakdown.return_speed} max={35} color={style.color} />
        <SubBar label="Context" value={breakdown.appropriateness} max={25} color={style.color} />
      </div>

      {/* Message */}
      <p className="text-xs text-text-muted">{message_th}</p>

      {/* Sessions count */}
      {n_sessions > 0 && (
        <p className="text-[10px] text-text-disabled">คำนวณจาก {n_sessions} ครั้ง</p>
      )}
    </div>
  );
}

function SubBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className="text-[10px] text-text-disabled">{label}</span>
        <span className="text-[10px] font-mono" style={{ color }}>{Math.round(value)}</span>
      </div>
      <div className="h-1.5 bg-bg-raised rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: color + "99" }}
        />
      </div>
    </div>
  );
}
