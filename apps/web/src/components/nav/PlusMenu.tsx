"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Plus, QrCode, Cpu, ClipboardList } from "lucide-react";
import { twMerge } from "tailwind-merge";

const menuItems = [
  { href: "/me/device/add?method=qr",     icon: QrCode,       label: "Scan QR" },
  { href: "/me/device/add",               icon: Cpu,          label: "Add device" },
  { href: "/log",                          icon: ClipboardList, label: "Log reading" },
];

export function PlusMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        aria-label="Quick actions"
        onClick={() => setOpen((v) => !v)}
        className={twMerge(
          "h-9 w-9 rounded-full flex items-center justify-center transition-all duration-200",
          open ? "bg-mint-500 text-white rotate-45" : "bg-bg-elevated text-text-muted hover:text-text-primary"
        )}
      >
        <Plus size={18} strokeWidth={2} />
      </button>

      {open && (
        <div className="absolute right-0 top-12 w-44 bg-bg-elevated border border-border-soft rounded-2xl py-1.5 shadow-xl z-50">
          {menuItems.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-2.5 text-sm text-text-primary hover:bg-bg-raised transition-colors"
            >
              <Icon size={15} strokeWidth={1.6} className="text-mint-500" />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
