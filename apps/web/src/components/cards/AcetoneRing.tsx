"use client";

import { useMemo } from "react";
import { convertFromMv, formatAcetone, unitLabel, useUnits } from "@/lib/units";
import { LABEL_STYLE, LABEL_TH, backendLabelToZone, zoneProgress } from "@/lib/riskLabel";

interface Props {
  value: number | null;
  label: string | null;
  size?: number;
  /** Skip the centered value/unit/zone-label overlay — for when that
   *  information is already displayed separately beside the ring (e.g.
   *  FloatingHero's number-beside-gauge layout), so the ring becomes a
   *  purely decorative visualizer rather than duplicating the text. */
  hideText?: boolean;
  /** One-shot scale beat, mirrors AcetoneTrendChart's ring pulse. */
  pulse?: boolean;
}

export function AcetoneRing({ value, label, size = 200, hideText = false, pulse = false }: Props) {
  const { unit } = useUnits();
  const zone = backendLabelToZone(label);
  const cfg = LABEL_STYLE[zone] ?? LABEL_STYLE.unreliable;
  const r = (size / 2) - 16;
  const circumference = 2 * Math.PI * r;

  // Proportional-within-zone fill against the real 5-zone thresholds
  // (riskLabel.ts's own ZONE_THRESHOLDS), not a flat linear mV/max ratio —
  // so the ring's arc actually lines up with the zone the number/pill
  // beside it names.
  const fill = useMemo(() => {
    if (value == null) return 0;
    return zoneProgress(convertFromMv(value, "ppm"));
  }, [value]);

  const dashOffset = circumference * (1 - fill);
  const gradId = `ring-grad-${label ?? "empty"}`;

  // Center-text sizing must track `size` — these were fixed text-4xl/text-xs
  // classes regardless of the size prop, so at smaller rings (e.g. Home's
  // 160px) the number/unit/zone stack ran wider than the inner ring
  // diameter and visibly collided with the stroke. Scaled off a 200px
  // baseline (text-4xl ≈ 36px) so size={200} renders identically to before.
  // Text-scaling math is moot when hideText is on — skip computing it.
  const scale = size / 200;
  const valuePx = Math.max(20, Math.round(36 * scale));
  const smallPx = Math.max(11, Math.round(13 * scale));

  return (
    <div
      className={`relative flex items-center justify-center ${pulse ? "animate-zone-pulse" : ""}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden={hideText || undefined}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={cfg.grad[0]} />
            <stop offset="100%" stopColor={cfg.grad[1]} />
          </linearGradient>
        </defs>
        {/* Track — theme/accent-aware (was a hardcoded near-black that only
            read correctly against the old dark card surface). */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-border-soft)"
          strokeWidth={12}
        />
        {/* Filled arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={value != null ? `url(#${gradId})` : "var(--color-border-strong)"}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)" }}
        />
      </svg>
      {/* Center text */}
      {!hideText && (
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4">
        <p
          className="font-bold tracking-tight leading-none"
          style={{ color: cfg.color, fontSize: valuePx }}
        >
          {formatAcetone(value, unit)}
        </p>
        <p className="text-text-muted" style={{ fontSize: smallPx, marginTop: 2 * scale }}>
          {unitLabel(unit)}
        </p>
        {label && (
          <p
            className="font-semibold text-center"
            style={{ color: cfg.color, fontSize: smallPx, marginTop: 8 * scale }}
          >
            {LABEL_TH[zone] ?? label}
          </p>
        )}
      </div>
      )}
    </div>
  );
}
