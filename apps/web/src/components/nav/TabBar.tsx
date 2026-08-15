"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, LineChart, Wind, CircleUser } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { useT } from "@/lib/i18n";

interface TabItem {
  href: string;
  labelKey: "nav.home" | "nav.trends" | "nav.breathing" | "nav.profile";
  fallback: string;
  icon: typeof House;
  match: (p: string) => boolean;
}

const TABS: TabItem[] = [
  { href: "/home", labelKey: "nav.home", fallback: "Today", icon: House, match: (p) => p === "/home" },
  { href: "/breathing", labelKey: "nav.breathing", fallback: "Breathing", icon: Wind, match: (p) => p.startsWith("/breathing") },
  { href: "/trends", labelKey: "nav.trends", fallback: "Trends", icon: LineChart, match: (p) => p.startsWith("/trends") },
  { href: "/me", labelKey: "nav.profile", fallback: "Profile", icon: CircleUser, match: (p) => p.startsWith("/me") },
];

export function TabBar() {
  const pathname = usePathname();
  const { t } = useT();

  return (
    <nav
      aria-label="Main navigation"
      className="fixed bottom-0 left-0 right-0 z-40 bg-bg-surface border-t border-border-soft print:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="max-w-md mx-auto grid grid-cols-4">
        {TABS.map(({ href, labelKey, fallback, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className="flex flex-col items-center justify-center gap-1 py-2.5"
            >
              <Icon
                size={24}
                strokeWidth={active ? 2.2 : 1.8}
                className={twMerge("transition-colors duration-200", active ? "text-mint-500" : "text-text-muted")}
              />
              <span
                className={twMerge(
                  "text-[11px] font-medium transition-colors duration-200",
                  active ? "text-mint-500" : "text-text-muted"
                )}
              >
                {t(labelKey) || fallback}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
