// The app's signature motif — 3 concentric rings + a glowing core, one ring
// slowly pulsing. Originally prototyped once in onboarding's done-screen
// (app/onboarding/page.tsx); formalized here so it's reused everywhere the
// app should feel alive (daily-check banner, idle breathing state, loading
// states) instead of being invented per-screen.
interface BreathPulseProps {
  size?: number; // px, outer diameter
  className?: string;
  /** "breathing" swaps the default one-shot ping ring for a true
   *  breathe-in/breathe-out loop across all rings + the core glow, at the
   *  same 4s cadence as the rest of the app's ambient motion (see
   *  animate-halo-breathe, globals.css). Defaults to "signature" so every
   *  existing call site renders byte-identical to before. */
  variant?: "signature" | "breathing";
}

export function BreathPulse({ size = 96, className, variant = "signature" }: BreathPulseProps) {
  const mid = size * 0.67;
  const inner = size * 0.42;
  const core = size * 0.17;
  const breathing = variant === "breathing";

  return (
    <div
      className={`relative flex items-center justify-center shrink-0 ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <div
        className={
          breathing
            ? "absolute rounded-full border border-mint-400/20 animate-breathe-orb-ring"
            : "absolute rounded-full border border-mint-400/8 animate-[ping_3s_ease-in-out_infinite]"
        }
        style={{ width: size, height: size, animationDelay: breathing ? "0s" : undefined }}
      />
      <div
        className={
          breathing
            ? "absolute rounded-full border border-mint-400/16 animate-breathe-orb-ring"
            : "absolute rounded-full border border-mint-400/12"
        }
        style={{ width: mid, height: mid, animationDelay: breathing ? "-0.4s" : undefined }}
      />
      <div
        className={
          breathing
            ? "absolute rounded-full border border-mint-400/24 animate-breathe-orb-ring"
            : "absolute rounded-full border border-mint-400/18"
        }
        style={{ width: inner, height: inner, animationDelay: breathing ? "-0.8s" : undefined }}
      />
      <div
        className={`rounded-full bg-mint-400/50 ${breathing ? "animate-breathe-orb-core" : ""}`}
        style={{ width: core, height: core, boxShadow: breathing ? undefined : "0 0 18px 6px rgba(72,199,140,0.35)" }}
      />
    </div>
  );
}
