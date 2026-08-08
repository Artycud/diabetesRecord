"use client";

import { useT } from "@/lib/i18n";
import { twMerge } from "tailwind-merge";

interface LangSwitcherProps {
  className?: string;
  variant?: "overlay" | "card";
}

export function LangSwitcher({ className, variant = "overlay" }: LangSwitcherProps) {
  const { locale, setLocale } = useT();

  if (variant === "card") {
    return (
      <div
        className={twMerge(
          "inline-flex items-center rounded-full bg-[#F1F1EF] p-1 text-[12px] font-medium",
          className,
        )}
      >
        <button
          onClick={() => setLocale("th")}
          aria-pressed={locale === "th"}
          aria-label="Switch to Thai"
          className={twMerge(
            "px-2 py-0.5 rounded-full tracking-wide transition-colors duration-150",
            locale === "th" ? "bg-[#5EBFA0] text-white" : "text-gray-500 hover:text-gray-700",
          )}
        >
          TH
        </button>
        <button
          onClick={() => setLocale("en")}
          aria-pressed={locale === "en"}
          aria-label="Switch to English"
          className={twMerge(
            "px-2 py-0.5 rounded-full tracking-wide transition-colors duration-150",
            locale === "en" ? "bg-[#5EBFA0] text-white" : "text-gray-500 hover:text-gray-700",
          )}
        >
          EN
        </button>
      </div>
    );
  }

  return (
    <div
      className={twMerge(
        "fixed top-3 right-3 z-50 flex items-center rounded-full border border-border-soft bg-white/85 backdrop-blur-md px-0.5 py-0.5 shadow-[0_2px_10px_-2px_rgba(0,0,0,0.08)] text-[11px] font-medium",
        className,
      )}
    >
      <button
        onClick={() => setLocale("th")}
        aria-pressed={locale === "th"}
        aria-label="Switch to Thai"
        className={twMerge(
          "px-2.5 py-1 rounded-full transition-colors tracking-wide",
          locale === "th" ? "bg-mint-500 text-white" : "text-charcoal-500/50 hover:text-charcoal-500",
        )}
      >
        TH
      </button>
      <button
        onClick={() => setLocale("en")}
        aria-pressed={locale === "en"}
        aria-label="Switch to English"
        className={twMerge(
          "px-2.5 py-1 rounded-full transition-colors tracking-wide",
          locale === "en" ? "bg-mint-500 text-white" : "text-charcoal-500/50 hover:text-charcoal-500",
        )}
      >
        EN
      </button>
    </div>
  );
}
