"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowLeft } from "lucide-react";
import { twMerge } from "tailwind-merge";

export default function AppearancePage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-tabbar space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="h-9 w-9 rounded-full bg-bg-elevated flex items-center justify-center">
          <ArrowLeft size={18} className="text-text-muted" />
        </button>
        <h1 className="text-lg font-semibold text-text-primary">Appearance</h1>
      </div>

      {/* Mode */}
      <div className="space-y-3">
        <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">Mode</p>
        <div className="grid grid-cols-3 gap-2">
          {(["system", "light", "dark"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setTheme(m)}
              className={twMerge(
                "py-3 rounded-2xl border text-sm font-medium transition-colors capitalize",
                theme === m
                  ? "border-mint-500 bg-mint-500/10 text-mint-500"
                  : "border-border-soft bg-bg-elevated text-text-muted hover:border-border-strong"
              )}
            >
              {m === "system" ? "System" : m === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
