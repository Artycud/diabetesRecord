"use client";

import Link from "next/link";

interface CategoryCardProps {
  icon: string;
  title: string;
  value: string;
  sub?: string;
  href?: string;
  iconBg?: string;
  iconColor?: string;
  comingSoon?: boolean;
}

export function CategoryCard({
  icon, title, value, sub, href, iconBg = "#00C896", iconColor = "#0A0A0A", comingSoon,
}: CategoryCardProps) {
  const inner = (
    <div className="rounded-2xl p-4 flex flex-col gap-3 h-full border border-border-card bg-bg-surface card-shadow">

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
