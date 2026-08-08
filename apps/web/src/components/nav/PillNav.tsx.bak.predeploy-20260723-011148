"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { twMerge } from "tailwind-merge";
import { useT } from "@/lib/i18n";
import { PlusMenu } from "./PlusMenu";

interface NavItem {
  href: string;
  label: string;
  match: (p: string) => boolean;
}

export function PillNav() {
  const pathname = usePathname();
  const { t } = useT();

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
      <nav className="flex flex-1 bg-bg-elevated rounded-full p-1 gap-0.5" aria-label="Main navigation">
        {items.map(({ href, label, match }) => {
          const active = match(pathname);
          return (
            <Link
              key={href}
              href={href}
              className={twMerge(
                "flex-1 text-center text-sm font-medium px-3 py-1.5 rounded-full transition-all duration-200",
                active
                  ? "bg-mint-500 text-white shadow-sm"
                  : "text-text-muted hover:text-text-primary"
              )}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <PlusMenu />
    </header>
  );
}
