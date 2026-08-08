"use client";

import { Flame } from "lucide-react";
import { twMerge } from "tailwind-merge";

interface StreakChipProps {
  current: number | undefined;
  /** Compact = icon+number only, for PillNav. Full = home greeting header. */
  compact?: boolean;
  className?: string;
}

// Reuses the existing peach-flame treatment from the old streak card so the
// "streak" visual language stays consistent wherever it now appears.
export function StreakChip({ current, compact = false, className }: StreakChipProps) {
  if (current == null) {
    if (compact) return null;
    return <div className={twMerge("h-7 w-20 bg-bg-raised rounded-full animate-pulse", className)} />;
  }

  const zero = current === 0;

  if (compact) {
    return (
      <div
        className={twMerge(
          "flex items-center gap-1",
          zero ? "text-text-disabled" : "text-peach-500",
          className
        )}
      >
        <Flame size={14} className={zero ? "" : "fill-peach-500/20"} />
        <span className="text-xs font-semibold tabular-nums">{current}</span>
      </div>
    );
  }

  return (
    <div
      className={twMerge(
        "flex items-center gap-1.5 rounded-full px-3 py-1.5 shrink-0",
        zero ? "bg-bg-raised text-text-muted" : "bg-peach-500/15 text-peach-500",
        className
      )}
    >
      <Flame size={16} className={zero ? "" : "fill-peach-500/30"} />
      <span className="text-sm font-bold tabular-nums">{current}</span>
      <span className="text-xs font-medium opacity-80 whitespace-nowrap">
        {zero ? "start today" : "day streak"}
      </span>
    </div>
  );
}
