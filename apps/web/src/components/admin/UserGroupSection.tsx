"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function UserGroupSection({
  title,
  count,
  children,
  defaultOpen = true,
  action,
}: {
  title: string;
  count: number;
  children: ReactNode;
  defaultOpen?: boolean;
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <div className="flex items-center justify-between px-1 mb-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-text-disabled uppercase tracking-wide"
        >
          <ChevronDown size={13} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
          {title}
          <span className="text-text-disabled/70 font-normal normal-case">({count})</span>
        </button>
        {action}
      </div>
      {open && <div className="space-y-3">{children}</div>}
    </div>
  );
}
