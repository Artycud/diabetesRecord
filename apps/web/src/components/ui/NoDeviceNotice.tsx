import { Cpu } from "lucide-react";
import { twMerge } from "tailwind-merge";

interface Props {
  description: string;
  className?: string;
}

/** Shared "connect a device" empty state — reuses the icon language
 *  HomeHero's needsDevice state already established (Cpu in a muted well)
 *  so it reads as one consistent empty-state pattern wherever a
 *  device-gated section has nothing to show instead of vanishing. */
export function NoDeviceNotice({ description, className }: Props) {
  return (
    <div className={twMerge("flex items-center gap-3", className)}>
      <div className="h-9 w-9 rounded-xl bg-bg-raised flex items-center justify-center shrink-0">
        <Cpu size={16} className="text-text-muted" strokeWidth={1.6} />
      </div>
      <p className="text-sm text-text-muted leading-relaxed">{description}</p>
    </div>
  );
}
