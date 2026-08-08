"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Palette, Ruler, Clock, ChevronRight } from "lucide-react";
import { unitLabel, useUnits } from "@/lib/units";
import { useTimezone } from "@/lib/timezone";

export default function SettingsPage() {
  const router = useRouter();
  const { unit } = useUnits();
  const { timezone } = useTimezone();

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-24 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="h-9 w-9 rounded-full bg-bg-elevated flex items-center justify-center">
          <ArrowLeft size={18} className="text-text-muted" />
        </button>
        <h1 className="text-lg font-semibold text-text-primary">Settings</h1>
      </div>

      <div className="bg-bg-elevated rounded-2xl overflow-hidden">
        <Link href="/me/settings/appearance" className="flex items-center gap-3 px-4 py-3.5 hover:bg-bg-raised transition-colors border-b border-border-soft">
          <div className="h-8 w-8 rounded-lg bg-mint-500/20 flex items-center justify-center">
            <Palette size={15} className="text-mint-500" />
          </div>
          <span className="flex-1 text-sm text-text-primary font-medium">Theme & appearance</span>
          <ChevronRight size={14} className="text-text-disabled" />
        </Link>

        <Link href="/me/settings/units" className="flex items-center gap-3 px-4 py-3.5 hover:bg-bg-raised transition-colors border-b border-border-soft">
          <div className="h-8 w-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <Ruler size={15} className="text-blue-400" />
          </div>
          <span className="flex-1 text-sm text-text-primary font-medium">หน่วยของ Acetone</span>
          <span className="text-xs text-text-muted mr-1">{unitLabel(unit)}</span>
          <ChevronRight size={14} className="text-text-disabled" />
        </Link>

        <Link href="/me/settings/timezone" className="flex items-center gap-3 px-4 py-3.5 hover:bg-bg-raised transition-colors">
          <div className="h-8 w-8 rounded-lg bg-gold-500/20 flex items-center justify-center">
            <Clock size={15} className="text-gold-500" />
          </div>
          <span className="flex-1 text-sm text-text-primary font-medium">เขตเวลา (Timezone)</span>
          <span className="text-xs text-text-muted mr-1 truncate max-w-[120px]">{timezone}</span>
          <ChevronRight size={14} className="text-text-disabled" />
        </Link>
      </div>
    </div>
  );
}
