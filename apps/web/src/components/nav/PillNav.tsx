"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { twMerge } from "tailwind-merge";
import { useT } from "@/lib/i18n";
import { api } from "@/lib/api";
import { useThemeConfig } from "@/components/theme/ThemeProvider";
import { StreakChip } from "@/components/StreakChip";
import { PlusMenu } from "./PlusMenu";

interface NavItem {
  href: string;
  label: string;
  match: (p: string) => boolean;
}

export function PillNav() {
  const pathname = usePathname();
  const { t } = useT();
  // Same query key Home already warms — free (no extra network round-trip
  // on most navigations), kept deliberately quiet/minimal here (no card
  // background, no "days" label) so it's a glance, not nav-bar pressure.
  const { data: streak } = useQuery({ queryKey: ["me", "streak"], queryFn: api.gamification.getStreak });
  const { cardStyle } = useThemeConfig();

  const items: NavItem[] = [
    {
      href: "/home",
      label: t("nav.health") || "Health",
      match: (p) => p === "/home" || p.startsWith("/trends"),
    },
    {
      href: "/breathing",
      label: t("nav.breathing") || "Breathing",
      match: (p) => p.startsWith("/breathing"),
    },
    {
      href: "/me/device",
      label: t("nav.device") || "Device",
      match: (p) => p.startsWith("/me/device"),
    },
    {
      href: "/me",
      label: t("nav.profile") || "Profile",
      match: (p) => p === "/me" || (p.startsWith("/me") && !p.startsWith("/me/device")),
    },
  ];

  return (
    <header className="sticky top-0 z-40 flex items-center gap-2 px-4 py-3 bg-bg-primary/90 backdrop-blur-md border-b border-border-soft">
      <nav
        className={twMerge(
          "flex flex-1 rounded-full p-1 gap-0.5",
          cardStyle === "neumorphic" ? "bg-bg-elevated neu-inset" : "bg-bg-elevated"
        )}
        aria-label="Main navigation"
      >
        {items.map(({ href, label, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={twMerge(
                "flex-1 text-center text-sm font-medium px-3 py-1.5 rounded-full transition-all duration-200",
                active
                  ? cardStyle === "neumorphic"
                    ? "bg-bg-raised text-mint-500 neu-raised"
                    : "bg-mint-500 text-white shadow-sm"
                  : "text-text-muted hover:text-text-primary"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      {streak && streak.current > 0 && (
        <Link href="/home" aria-label="Streak" className="px-1">
          <StreakChip current={streak.current} compact />
        </Link>
      )}
      <PlusMenu />
    </header>
  );
}
