"use client";

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  icon?: ReactNode;
  title: string;
  /** Small secondary line under the title (e.g. active date range, "per-session" scope). */
  subtitle?: ReactNode;
  unit?: string;
  /** Big headline number — the Health-app "here's the number" above the chart shape. */
  value?: string | null;
  valueLabel?: string;
  /** Right-aligned small controls (device select, overlay toggle, badge). */
  actions?: ReactNode;
  children: ReactNode;
  /** Skip the Card/CardContent chrome and return just the inner content —
   *  for callers (e.g. trends/page.tsx) that wrap this in BentoTile instead,
   *  matching the same bridge pattern already used by AcetoneMetricsGrid,
   *  TrendClassCard, and BaselineCard. */
  bare?: boolean;
}

export function TrendMetricCard({ icon, title, subtitle, unit, value, valueLabel, actions, children, bare }: Props) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {icon && <span className="shrink-0">{icon}</span>}
          <div className="min-w-0">
            <h2 className="font-semibold text-text-primary tracking-tight truncate">{title}</h2>
            {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
      {value != null && (
        <div className="flex items-baseline gap-1.5 mb-3">
          <span className="text-2xl font-bold text-text-primary tabular-nums leading-none">{value}</span>
          {(unit || valueLabel) && (
            <span className="text-xs text-text-muted">
              {unit}
              {unit && valueLabel && " · "}
              {valueLabel}
            </span>
          )}
        </div>
      )}
      {children}
    </>
  );

  if (bare) return content;

  return (
    <Card>
      <CardContent className="pt-5">{content}</CardContent>
    </Card>
  );
}
