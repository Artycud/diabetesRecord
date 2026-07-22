"use client";

import type { ReactNode } from "react";
import { twMerge } from "tailwind-merge";
import { Card } from "./card";

interface BannerProps {
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  variant?: "default" | "success" | "celebration";
  className?: string;
}

// `border` (width) is included explicitly, not just border-color — the
// neumorphic Card variant has no border utility at all by default, so a
// color-only class here would silently render invisible width:0.
const VARIANT_STYLES: Record<NonNullable<BannerProps["variant"]>, string> = {
  default: "",
  success: "border border-mint-500/25",
  celebration: "border border-gold-500/30 shadow-[0_0_24px_-4px_rgba(245,158,11,0.25)]",
};

/** Generic horizontal card — icon + title + subtitle + optional action.
 *  Used for both the daily-check nudge and streak/badge celebrations so
 *  the "something happened" visual language stays consistent app-wide. */
export function Banner({ icon, title, subtitle, action, variant = "default", className }: BannerProps) {
  return (
    <Card
      padding="md"
      className={twMerge(
        "flex items-center gap-3 transition-[border-color,box-shadow] duration-[var(--motion-slow)] ease-[var(--ease-emphasized)]",
        VARIANT_STYLES[variant],
        className
      )}
    >
      {icon && <div className="shrink-0">{icon}</div>}
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold text-text-primary leading-snug">{title}</p>
        {subtitle && <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </Card>
  );
}
