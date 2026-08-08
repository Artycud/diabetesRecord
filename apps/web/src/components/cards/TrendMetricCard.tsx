"use client";

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  icon?: ReactNode;
  title: string;
  unit?: string;
  /** Big headline number — the Health-app "here's the number" above the chart shape. */
  value?: string | null;
  valueLabel?: string;
  /** Right-aligned small controls (device select, overlay toggle, badge). */
  actions?: ReactNode;
  children: ReactNode;
}

export function TrendMetricCard({ icon, title, unit, value, valueLabel, actions, children }: Props) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            {icon}
            <h2 className="font-semibold text-text-primary tracking-tight truncate">{title}</h2>
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
      </CardContent>
    </Card>
  );
}
