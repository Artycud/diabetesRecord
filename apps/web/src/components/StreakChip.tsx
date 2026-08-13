"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import { twMerge } from "tailwind-merge";
import type { StreakOut } from "@/lib/api";
import { StreakMatrix } from "@/components/StreakMatrix";

interface StreakChipProps {
  streak: StreakOut | undefined;
  /** Compact = icon+number only, and (when streak data is loaded) a tap
   *  target that opens the 7-day StreakMatrix dropdown. Full = home
   *  greeting header (legacy usage, no dropdown). */
  compact?: boolean;
  className?: string;
}

/** Icon + color only, no chip background/padding — for contexts that
 *  already supply their own container (e.g. a bento tile) and just want
 *  the same flame treatment StreakChip uses, without nesting a
 *  chip-with-background inside another surface. */
export function FlameGlyph({ current, size = 16 }: { current: number | undefined; size?: number }) {
  const zero = !current;
  return <Flame size={size} className={zero ? "text-text-disabled" : "text-peach-500 fill-peach-500/20"} />;
}

// Reuses the existing peach-flame treatment from the old streak card so the
// "streak" visual language stays consistent wherever it now appears.
export function StreakChip({ streak, compact = false, className }: StreakChipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (streak == null) {
    if (compact) return null;
    return <div className={twMerge("h-7 w-20 bg-bg-raised rounded-full animate-pulse", className)} />;
  }

  const current = streak.current;
  const zero = current === 0;

  if (compact) {
    return (
      <div ref={ref} className="relative">
        <motion.button
          type="button"
          aria-label="Streak"
          onClick={() => setOpen((v) => !v)}
          whileTap={{ scale: 0.94 }}
          whileHover={{ scale: 1.02 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
          className={twMerge(
            "flex items-center gap-1 rounded-full px-1 py-0.5 -mx-1 -my-0.5",
            zero ? "text-text-disabled" : "text-peach-500",
            className
          )}
        >
          <Flame size={14} className={zero ? "" : "fill-peach-500/20"} />
          <span className="text-xs font-semibold tabular-nums">{current}</span>
        </motion.button>

        {open && (
          <div className="absolute right-0 top-10 w-72 bg-bg-elevated border border-border-soft rounded-2xl p-3 shadow-xl z-50 animate-fade-rise-in">
            <StreakMatrix streak={streak} />
          </div>
        )}
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
