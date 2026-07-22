"use client";

import { cva, type VariantProps } from "class-variance-authority";
import { twMerge } from "tailwind-merge";
import type { HTMLAttributes } from "react";
import { useThemeConfig } from "@/components/theme/ThemeProvider";

const cardVariants = cva("rounded-2xl transition-[box-shadow,background-color] duration-200", {
  variants: {
    padding: {
      none: "",
      sm: "p-3",
      md: "p-4",
      lg: "p-5",
    },
    appearance: {
      // Plain, maximum-contrast fallback — kept deliberately, not just for
      // accessibility need but so the picker always has a quiet option.
      flat:
        "border border-border-soft bg-bg-elevated shadow-[0_1px_2px_rgba(20,20,20,0.03),0_4px_16px_-8px_rgba(20,20,20,0.06)]",
      // Soft extruded shell — no border (a border line fights the "grows
      // out of the background" illusion). Shadow pair is theme-derived,
      // see globals.css .neu-raised.
      neumorphic: "bg-bg-elevated neu-raised",
      // Frosted/translucent — base look only; the SVG-refraction modifier
      // (.liquid-glass-refract) is applied ad-hoc on hero surfaces, not here.
      liquidGlass: "liquid-glass",
    },
  },
  defaultVariants: { padding: "none", appearance: "neumorphic" },
});

export interface CardProps
  extends HTMLAttributes<HTMLDivElement>,
    Omit<VariantProps<typeof cardVariants>, "appearance"> {
  /** Overrides the user's saved appearance preference for this one card (rare — most cards should just follow the global setting). */
  forceAppearance?: "neumorphic" | "liquidGlass" | "flat";
  /** Opt-in SVG-refraction enhancement, only visible when appearance is
   * liquidGlass. Reserve for one or two hero surfaces (see globals.css
   * .liquid-glass-refract) — GPU-expensive, not for every card on a list. */
  refract?: boolean;
}

export function Card({ className, padding, forceAppearance, refract, ...props }: CardProps) {
  const { cardStyle } = useThemeConfig();
  const appearance = forceAppearance ?? cardStyle;
  return (
    <div
      className={twMerge(
        cardVariants({ padding, appearance }),
        refract && appearance === "liquidGlass" && "liquid-glass-refract",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={twMerge("p-5 pb-0", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={twMerge("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={twMerge(
        "border-t border-border px-5 py-4 flex items-center gap-2",
        className
      )}
      {...props}
    />
  );
}
