"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { twMerge } from "tailwind-merge";

interface Props {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

/**
 * Collapsed-by-default progressive-disclosure wrapper for secondary/
 * interpretive cards (trend classification, baseline, AI take) that
 * shouldn't compete with a screen's primary hero content by default.
 */
export function DetailsSection({ title, children, defaultOpen = false, className }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className={className}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between rounded-2xl border border-border-soft bg-bg-surface px-4 py-3 text-left"
      >
        <span className="text-sm font-medium text-text-primary">{title}</span>
        <ChevronDown
          size={16}
          className={twMerge("text-text-muted transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      {open && <div className="mt-3 space-y-3 animate-fade-rise-in">{children}</div>}
    </div>
  );
}
