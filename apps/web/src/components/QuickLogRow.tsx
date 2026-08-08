"use client";

import Link from "next/link";
import { TestTube, Utensils, Scale, Activity } from "lucide-react";
import { useT } from "@/lib/i18n";

// Replaces the old global "+" menu's ambiguous "Log reading" item with four
// specific, self-explanatory actions. Each deep-links into /log's existing
// ?tab= support (log/page.tsx's TAB_MAP) — no changes needed there.
const ITEMS = [
  { tab: "ketone",   icon: TestTube, labelKey: "log.tabs.ketone" },
  { tab: "meal",     icon: Utensils, labelKey: "log.tabs.meal" },
  { tab: "weight",   icon: Scale,    labelKey: "log.tabs.weight" },
  { tab: "activity", icon: Activity, labelKey: "log.tabs.activity" },
] as const;

export function QuickLogRow({ className }: { className?: string }) {
  const { t } = useT();
  return (
    <div className={className}>
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ITEMS.map(({ tab, icon: Icon, labelKey }) => (
          <Link
            key={tab}
            href={`/log?tab=${tab}`}
            className="flex items-center gap-1.5 shrink-0 rounded-full bg-bg-raised px-3.5 py-2 text-xs font-medium text-text-primary active:scale-95 transition-transform"
          >
            <Icon size={14} className="text-mint-500" />
            {t(labelKey)}
          </Link>
        ))}
      </div>
    </div>
  );
}
