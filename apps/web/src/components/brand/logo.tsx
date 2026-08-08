import { twMerge } from "tailwind-merge";

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/brand-logo.webp"
      alt="MetaBreath"
      className={twMerge("object-contain", className)}
    />
  );
}
