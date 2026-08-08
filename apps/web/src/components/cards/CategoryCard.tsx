"use client";

import Link from "next/link";
import { twMerge } from "tailwind-merge";
import { useThemeConfig } from "@/components/theme/ThemeProvider";

interface CategoryCardProps {
  icon: string;
  title: string;
  value: string;
  sub?: string;
  href?: string;
  iconBg?: string;
  iconColor?: string;
  comingSoon?: boolean;
  /** "tile" (default) is the original grid tile. "row" is a bare list-row
   *  layout for a flat grouped-list section — same link/comingSoon
   *  behavior, different outer shell. */
  variant?: "tile" | "row";
}

export function CategoryCard({
  icon, title, value, sub, href, iconBg = "#00C896", iconColor = "#0A0A0A", comingSoon, variant = "tile",
}: CategoryCardProps) {
  const { cardStyle } = useThemeConfig();

  if (variant === "row") {
    const inner = (
      <div className="flex items-center gap-3 w-full py-3">
        <div
          className="h-9 w-9 rounded-xl flex items-center justify-center text-base shrink-0"
          style={{ backgroundColor: iconBg + "20", color: iconBg }}
        >
          <span>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-text-primary">{title}</p>
          {sub && !comingSoon && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
        </div>
        <div className="text-right shrink-0">
          {comingSoon ? (
            <p className="text-xs text-text-disabled">Coming soon</p>
          ) : (
            <p className="text-sm font-semibold text-text-primary">{value}</p>
          )}
        </div>
      </div>
    );
    if (href && !comingSoon) {
      return (
        <Link href={href} className="block hover:bg-bg-raised rounded-xl -mx-1 px-1 transition-colors">
          {inner}
        </Link>
      );
    }
    return inner;
  }

  const inner = (
    <div
      className={twMerge(
        "rounded-2xl p-4 flex flex-col gap-3 h-full",
        cardStyle === "neumorphic"
          ? "bg-bg-elevated neu-raised"
          : cardStyle === "liquidGlass"
            ? "liquid-glass"
            : "bg-bg-elevated"
      )}
    >
      <div
        className="h-9 w-9 rounded-xl flex items-center justify-center text-base"
        style={{ backgroundColor: iconBg + "20", color: iconBg }}
      >
        <span>{icon}</span>
      </div>
      <div>
        <p className="text-xs text-text-muted font-medium uppercase tracking-wider">{title}</p>
        {comingSoon ? (
          <p className="text-sm text-text-disabled mt-1">Coming soon</p>
        ) : (
          <>
            <p className="text-xl font-bold text-text-primary mt-0.5">{value}</p>
            {sub && <p className="text-xs text-text-muted mt-0.5">{sub}</p>}
          </>
        )}
      </div>
    </div>
  );

  if (href && !comingSoon) {
    return <Link href={href} className="block">{inner}</Link>;
  }
  return inner;
}
