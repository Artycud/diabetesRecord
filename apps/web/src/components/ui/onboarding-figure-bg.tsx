"use client";

import type { HTMLAttributes } from "react";

/**
 * Reusable dark-gradient backdrop for onboarding figure/illustration areas.
 * Layered teal/blue brand glow + dot-grid texture fading at edges.
 * Passes all div props through so callers can attach pointer events, style, etc.
 */
export function OnboardingFigureBg({
  children,
  className,
  style,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl select-none ${className ?? ""}`}
      style={{
        background: [
          // Mint glow behind head/shoulders
          "radial-gradient(ellipse 65% 55% at 50% 28%, rgba(1,209,155,0.14) 0%, transparent 68%)",
          // Mint corner blob — bottom-left
          "radial-gradient(ellipse 45% 38% at 10% 90%, rgba(1,209,155,0.10) 0%, transparent 60%)",
          // Indigo corner blob — bottom-right
          "radial-gradient(ellipse 38% 32% at 90% 92%, rgba(99,102,241,0.07) 0%, transparent 58%)",
          // Navy base
          "linear-gradient(165deg, #142552 0%, #0e1a3e 100%)",
        ].join(", "),
        ...style,
      }}
      {...props}
    >
      {/* Dot-grid texture — fades toward edges so it doesn't compete with figures */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 80% at 50% 50%, black 5%, transparent 80%)",
          maskImage:
            "radial-gradient(ellipse 80% 80% at 50% 50%, black 5%, transparent 80%)",
        }}
      />
      {children}
    </div>
  );
}
