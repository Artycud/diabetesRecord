"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, Bot, Home, Plus, User } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { useT } from "@/lib/i18n";

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useT();

  const navItems = [
    { href: "/home",   icon: Home,     label: t("nav.home")   },
    { href: "/log",    icon: Plus,     label: t("nav.log")    },
    { href: "/chat",   icon: Bot,      label: "AI"            },
    { href: "/trends", icon: BarChart2, label: t("nav.trends") },
    { href: "/me",     icon: User,     label: t("nav.me")     },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex border-t border-border-soft bg-white md:hidden">
      {navItems.map(({ href, icon: Icon, label }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={twMerge(
              "flex flex-1 flex-col items-center gap-0.5 py-3 text-[10px] font-medium transition-colors",
              active ? "text-mint-700" : "text-muted"
            )}
          >
            <Icon
              size={19}
              strokeWidth={1.6}
              className={twMerge(
                "transition-colors",
                active ? "stroke-mint-600" : "stroke-current"
              )}
            />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
