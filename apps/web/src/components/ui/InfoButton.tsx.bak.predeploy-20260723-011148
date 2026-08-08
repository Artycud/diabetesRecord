"use client";

import { useState, type ReactNode } from "react";
import { Info, X } from "lucide-react";

interface Props {
  title: string;
  children: ReactNode;
  ariaLabel?: string;
}

export function InfoButton({ title, children, ariaLabel = "ดูรายละเอียด" }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={ariaLabel}
        className="h-7 w-7 rounded-full flex items-center justify-center text-text-muted hover:text-text-primary hover:bg-bg-raised transition-colors"
      >
        <Info size={16} strokeWidth={1.8} />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          <div className="relative w-full max-w-md bg-bg-surface rounded-t-3xl sm:rounded-3xl pb-8 px-5 pt-5 max-h-[85vh] flex flex-col">
            <div className="w-10 h-1 bg-border-subtle rounded-full mx-auto mb-4 sm:hidden shrink-0" />

            <div className="flex items-start justify-between mb-3 shrink-0 gap-3">
              <h2 className="text-base font-semibold text-text-primary leading-snug">{title}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 -mr-1.5 rounded-xl text-text-muted hover:text-text-primary transition-colors shrink-0"
                aria-label="ปิด"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 min-h-0 text-sm text-text-primary leading-relaxed space-y-3">
              {children}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
