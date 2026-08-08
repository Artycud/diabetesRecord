// The app's signature motif — 3 concentric rings + a glowing core, one ring
// slowly pulsing. Originally prototyped once in onboarding's done-screen
// (app/onboarding/page.tsx); formalized here so it's reused everywhere the
// app should feel alive (daily-check banner, idle breathing state, loading
// states) instead of being invented per-screen.
interface BreathPulseProps {
  size?: number; // px, outer diameter
  className?: string;
}

export function BreathPulse({ size = 96, className }: BreathPulseProps) {
  const mid = size * 0.67;
  const inner = size * 0.42;
  const core = size * 0.17;

  return (
    <div
      className={`relative flex items-center justify-center shrink-0 ${className ?? ""}`}
      style={{ width: size, height: size }}
    >
      <div
        className="absolute rounded-full border border-mint-400/8 animate-[ping_3s_ease-in-out_infinite]"
        style={{ width: size, height: size }}
      />
      <div className="absolute rounded-full border border-mint-400/12" style={{ width: mid, height: mid }} />
      <div className="absolute rounded-full border border-mint-400/18" style={{ width: inner, height: inner }} />
      <div
        className="rounded-full bg-mint-400/50"
        style={{ width: core, height: core, boxShadow: "0 0 18px 6px rgba(72,199,140,0.35)" }}
      />
    </div>
  );
}
