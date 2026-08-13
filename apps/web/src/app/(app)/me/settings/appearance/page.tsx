"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { ArrowLeft } from "lucide-react";
import { twMerge } from "tailwind-merge";
import { useAccent } from "@/lib/accent";

type ModePreset = "system" | "light" | "dark" | "darkBlue";

// Preview swatches necessarily duplicate the hex values from globals.css's
// [data-accent="cyan"/"blue"] blocks — a swatch for a *non-active* preset
// can't read a live CSS custom property, since that variable only reflects
// whichever accent is currently applied. If the accent palette there ever
// changes, update these too.
const MODES: { key: ModePreset; label: string; swatch: React.CSSProperties; dot?: string }[] = [
  { key: "system", label: "System", swatch: { background: "linear-gradient(135deg, #F2F2F7 50%, #0A0A0A 50%)" } },
  { key: "light", label: "Light", swatch: { background: "#F2F2F7" }, dot: "#01D19B" },
  { key: "dark", label: "Dark", swatch: { background: "#000000" }, dot: "#01D19B" },
  { key: "darkBlue", label: "Dark Blue", swatch: { background: "#000000" }, dot: "#3B82F6" },
];

const ACCENT_COLORS: Record<"mint" | "cyan", string> = { mint: "#01D19B", cyan: "#00BCD4" };

export default function AppearancePage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { accent, setAccent } = useAccent();

  // "Dark Blue" is a one-click preset over the same two underlying axes
  // (next-themes' theme + accent.tsx's accent), not a third axis of its
  // own — selecting it sets both at once, so it reads as a single mode
  // rather than "pick Dark, then remember to also go set the accent."
  const activePreset: ModePreset =
    theme === "dark" && accent === "blue" ? "darkBlue"
    : theme === "light" ? "light"
    : theme === "dark" ? "dark"
    : "system";

  function selectMode(preset: ModePreset) {
    if (preset === "darkBlue") {
      setTheme("dark");
      setAccent("blue");
      return;
    }
    setTheme(preset);
    // Only Dark Blue forces the blue accent — leaving it set while switching
    // to a different mode would make that mode look tinted for no visible
    // reason, so drop back to the default the moment you step away from it.
    if (accent === "blue") setAccent("mint");
  }

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
        <div className="grid grid-cols-2 gap-2">
          {MODES.map(({ key, label, swatch, dot }) => (
            <button
              key={key}
              onClick={() => selectMode(key)}
              className={twMerge(
                "flex items-center justify-center gap-2.5 py-3 px-3 rounded-2xl border text-sm font-medium transition-colors",
                activePreset === key
                  ? "border-mint-500 bg-mint-500/10 text-mint-500"
                  : "border-border-soft bg-bg-elevated text-text-muted hover:border-border-strong"
              )}
            >
              <span
                className="h-6 w-6 rounded-full border border-border-soft/60 shrink-0 relative overflow-hidden"
                style={swatch}
                aria-hidden="true"
              >
                {dot && <span className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full" style={{ background: dot }} />}
              </span>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Accent — independent of Mode above; see apps/web/src/lib/accent.tsx.
          "Blue" isn't offered here — it's the Dark Blue mode preset above,
          not a standalone swatch you'd combine with Light/System yourself. */}
      <div className="space-y-3">
        <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">Accent</p>
        <div className="grid grid-cols-2 gap-2">
          {(["mint", "cyan"] as const).map((a) => (
            <button
              key={a}
              onClick={() => setAccent(a)}
              className={twMerge(
                "flex items-center justify-center gap-2.5 py-3 px-3 rounded-2xl border text-sm font-medium transition-colors capitalize",
                accent === a
                  ? "border-mint-500 bg-mint-500/10 text-mint-500"
                  : "border-border-soft bg-bg-elevated text-text-muted hover:border-border-strong"
              )}
            >
              <span className="h-5 w-5 rounded-full shrink-0" style={{ background: ACCENT_COLORS[a] }} aria-hidden="true" />
              {a === "mint" ? "Mint" : "Cyan"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
