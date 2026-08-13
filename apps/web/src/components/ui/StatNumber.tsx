import { twMerge } from "tailwind-merge";
import type { HTMLAttributes, ReactNode } from "react";

// Playfair display face (`.stat-display`, globals.css) reserved for numeric
// hero stats and named moments — kept rare on purpose so it reads as
// premium rather than decorative. Don't use for body copy/buttons/nav.
const SIZES = {
  sm: "text-lg",
  md: "text-2xl",
  lg: "text-3xl",
  xl: "text-4xl",
  "2xl": "text-5xl",
  // Reserved for the single largest number on a screen (Home hero's today
  // reading) — deliberately one tier above 2xl so that spot is unambiguous.
  hero: "text-6xl sm:text-7xl",
} as const;

interface StatNumberProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  value: ReactNode;
  unit?: string;
  size?: keyof typeof SIZES;
  /** Overrides the value text color (e.g. zone color) — text-text-primary is baked onto the inner span, so className alone can't reach it. */
  color?: string;
  /** "mono" swaps in the lab-instrument monospace treatment (.stat-mono,
   *  globals.css) for readouts that should feel like a telemetry readout
   *  rather than a generic hero stat. Defaults to the existing display face. */
  font?: "display" | "mono";
}

export function StatNumber({ value, unit, size = "md", color, className, font = "display", ...props }: StatNumberProps) {
  return (
    <span className={twMerge("inline-flex items-baseline gap-1", className)} {...props}>
      <span
        className={twMerge(font === "mono" ? "stat-mono" : "stat-display font-bold", "text-text-primary", SIZES[size])}
        style={color ? { color } : undefined}
      >
        {value}
      </span>
      {unit && <span className="text-xs text-text-muted">{unit}</span>}
    </span>
  );
}
