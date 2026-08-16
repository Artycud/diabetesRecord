"use client";

import { Search, X } from "lucide-react";

export function UserSearchBar({
  value,
  onChange,
  placeholder = "ค้นหาชื่อ, username, หรืออีเมล...",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-disabled" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-border-soft bg-bg-surface text-text-primary placeholder:text-text-disabled pl-10 pr-9 py-2.5 text-sm outline-none transition focus:border-mint-500 focus:ring-2 focus:ring-mint-500/20"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-text-disabled hover:text-text-muted"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
