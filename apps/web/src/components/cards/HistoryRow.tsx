"use client";

import type { ReactNode } from "react";

interface Props {
  leadingColor?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  primary: ReactNode;
  secondary?: ReactNode;
}

/** A single history entry as a row-card — replaces dense `<table>` rows,
 *  which read as spreadsheet export rather than a personal history. */
export function HistoryRow({ leadingColor, title, subtitle, primary, secondary }: Props) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-bg-raised transition-colors">
      {leadingColor && (
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: leadingColor }} />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{title}</p>
        {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-semibold text-text-primary tabular-nums">{primary}</p>
        {secondary && <p className="text-xs text-text-muted mt-0.5">{secondary}</p>}
      </div>
    </div>
  );
}
