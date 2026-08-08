"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart2, BookOpen, Bot, Home, LogOut, Plus, Shield, User } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { BrandMark } from "@/components/brand/logo";

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const { t } = useT();

  const navItems = [
    { href: "/home",   icon: Home,      label: t("nav.home")    },
    { href: "/log",    icon: Plus,      label: t("nav.log")     },
    { href: "/chat",   icon: Bot,       label: "AI Chat"        },
    { href: "/learn",  icon: BookOpen,  label: t("nav.learn")   },
    { href: "/trends", icon: BarChart2, label: t("nav.trends")  },
    { href: "/me",     icon: User,      label: t("nav.profile") },
    { href: "/admin",  icon: Shield,    label: "Admin"          },
  ];

  return (
    <aside className="hidden md:flex w-60 flex-col border-r border-border-soft bg-white">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-border-soft">
        <BrandMark className="h-9 w-9 rounded-xl" />
        <div>
          <p className="font-semibold text-charcoal-500 leading-tight tracking-tight">{t("app.name")}</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-3 space-y-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              className={twMerge(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-mint-50 text-mint-700"
                  : "text-charcoal-500/70 hover:bg-surface-2 hover:text-charcoal-500"
              )}
            >
              <Icon size={17} strokeWidth={1.6} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="border-t border-border-soft p-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-mint-50 border border-mint-100 flex items-center justify-center text-mint-700 font-semibold text-sm">
            {user?.profile?.display_name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-charcoal-500 truncate">
              {user?.profile?.display_name ?? user?.username}
            </p>
            <p className="text-xs text-muted truncate">{user?.email}</p>
          </div>
          <button
            onClick={logout}
            className="text-muted hover:text-charcoal-500 transition-colors"
            title={t("auth.logout")}
          >
            <LogOut size={15} strokeWidth={1.6} />
          </button>
        </div>
      </div>
    </aside>
  );
}
