import { cva, type VariantProps } from "class-variance-authority";
import { twMerge } from "tailwind-merge";
import type { HTMLAttributes } from "react";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        mint:   "bg-mint-500/15 text-mint-600",
        peach:  "bg-peach-500/15 text-peach-600",
        gray:   "bg-muted-bg text-muted",
        red:    "bg-red-500/15 text-red-600",
        yellow: "bg-yellow-500/15 text-yellow-600",
      },
    },
    defaultVariants: { variant: "mint" },
  }
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={twMerge(badgeVariants({ variant }), className)} {...props} />
  );
}
