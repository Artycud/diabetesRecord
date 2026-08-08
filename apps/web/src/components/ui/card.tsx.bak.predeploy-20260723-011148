import { twMerge } from "tailwind-merge";
import type { HTMLAttributes } from "react";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={twMerge(
        "rounded-2xl border border-border-soft bg-bg-elevated shadow-[0_1px_2px_rgba(20,20,20,0.03),0_4px_16px_-8px_rgba(20,20,20,0.06)]",
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={twMerge("p-5 pb-0", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={twMerge("p-5", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={twMerge(
        "border-t border-border px-5 py-4 flex items-center gap-2",
        className
      )}
      {...props}
    />
  );
}
