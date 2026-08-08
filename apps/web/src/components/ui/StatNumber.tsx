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
  hero: "text-5xl",
} as const;

interface StatNumberProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  value: ReactNode;
  unit?: string;
  size?: keyof typeof SIZES;
}

export function StatNumber({ value, unit, size = "md", className, ...props }: StatNumberProps) {
  return (
    <span className={twMerge("inline-flex items-baseline gap-1", className)} {...props}>
      <span className={twMerge("stat-display font-bold text-text-primary", SIZES[size])}>
        {value}
      </span>
      {unit && <span className="text-xs text-text-muted">{unit}</span>}
    </span>
  );
}
