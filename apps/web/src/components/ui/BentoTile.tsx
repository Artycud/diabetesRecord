import { twMerge } from "tailwind-merge";
import type { HTMLAttributes } from "react";

/**
 * Frosted grid tile for Home's bento layout — a new visual treatment
 * (no other surface in the app uses backdrop-blur as content chrome; every
 * existing backdrop-blur usage is a modal overlay scrim). Deliberately
 * distinct from Card (ui/card.tsx): larger corner radius, translucent
 * rather than opaque, meant to float over the page background rather than
 * sit as a flat grouped-table row.
 */
export function BentoTile({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={twMerge(
        "rounded-[28px] bg-bg-surface/90 backdrop-blur-2xl border border-border-soft/60 shadow-[0_8px_30px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.5)] p-5 min-h-[132px] flex flex-col",
        className
      )}
      {...props}
    />
  );
}
