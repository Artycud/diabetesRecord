"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowLeft, Check } from "lucide-react";
import { useThemeConfig, ACCENT_COLORS } from "@/components/theme/ThemeProvider";
import { twMerge } from "tailwind-merge";

type AccentColor = keyof typeof ACCENT_COLORS;
type CardStyle = "solid" | "glass" | "gradient";

const ACCENT_LABELS: Record<AccentColor, string> = {
  mint:   "Mint",
  peach:  "Peach",
  purple: "Purple",
  blue:   "Blue",
  pink:   "Pink",
  yellow: "Yellow",
};

const CARD_STYLES: { value: CardStyle; label: string }[] = [
  { value: "solid",    label: "Solid" },
  { value: "glass",    label: "Glass" },
  { value: "gradient", label: "Gradient" },
];

export default function AppearancePage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { accent, setAccent, cardStyle, setCardStyle } = useThemeConfig();

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-24 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => router.back()} className="h-9 w-9 rounded-full bg-bg-elevated flex items-center justify-center">
          <ArrowLeft size={18} className="text-text-muted" />
        </button>
        <h1 className="text-lg font-semibold text-text-primary">Theme & appearance</h1>
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

      {/* Accent color */}
      <div className="space-y-3">
        <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">Accent Color</p>
        <div className="grid grid-cols-6 gap-3">
          {(Object.entries(ACCENT_COLORS) as [AccentColor, string][]).map(([key, color]) => (
            <button
              key={key}
              onClick={() => setAccent(key)}
              title={ACCENT_LABELS[key]}
              className="flex flex-col items-center gap-1.5"
            >
              <div
                className="h-10 w-10 rounded-full border-2 flex items-center justify-center transition-all hover:scale-110"
                style={{
                  backgroundColor: color,
                  borderColor: accent === key ? "#FAFAFA" : color,
                  transform: accent === key ? "scale(1.15)" : undefined,
                }}
              >
                {accent === key && <Check size={14} className="text-white" strokeWidth={3} />}
              </div>
              <span className="text-[10px] text-text-muted">{ACCENT_LABELS[key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Card style */}
      <div className="space-y-3">
        <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">Card Style</p>
        <div className="grid grid-cols-3 gap-2">
          {CARD_STYLES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setCardStyle(value)}
              className={twMerge(
                "py-3 rounded-2xl border text-sm font-medium transition-colors",
                cardStyle === value
                  ? "border-mint-500 bg-mint-500/10 text-mint-500"
                  : "border-border-soft bg-bg-elevated text-text-muted hover:border-border-strong"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Preview */}
      <div className="space-y-3">
        <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">Preview</p>
        <div className="bg-bg-elevated rounded-2xl p-4 space-y-3">
          <div className="h-8 rounded-full bg-bg-raised flex items-center px-3">
            <span className="text-xs text-text-muted">Health · Breathing · Device · Profile</span>
          </div>
          <div className="bg-bg-raised rounded-2xl p-4 flex items-center gap-3">
            <div
              className="h-12 w-12 rounded-full border-4 flex items-center justify-center"
              style={{ borderColor: ACCENT_COLORS[accent] }}
            >
              <span className="text-xs font-bold" style={{ color: ACCENT_COLORS[accent] }}>42</span>
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">Acetone Ring</p>
              <p className="text-xs text-text-muted">Live preview</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
