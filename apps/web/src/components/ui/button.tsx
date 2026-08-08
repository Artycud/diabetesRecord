import { cva, type VariantProps } from "class-variance-authority";
import { twMerge } from "tailwind-merge";
import { forwardRef, type ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98]",
  {
    variants: {
      variant: {
        primary:
          "bg-mint-500 text-white shadow-sm hover:bg-mint-600",
        secondary:
          "bg-peach-500 text-white shadow-sm hover:bg-peach-600",
        outline:
          "border border-mint-500 text-mint-600 hover:bg-mint-50",
        ghost:
          "text-text-muted hover:bg-bg-raised",
        destructive:
          "bg-red-500 text-white hover:bg-red-600",
      },
      size: {
        sm:   "h-8 px-3 text-sm",
        md:   "h-10 px-4 text-sm",
        lg:   "h-12 px-6 text-base",
        xl:   "h-14 px-8 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={twMerge(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
);
Button.displayName = "Button";
