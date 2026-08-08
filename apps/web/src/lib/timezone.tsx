"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { parseServerTime } from "@/lib/time";

// Common IANA timezones exposed in the settings UI. Any valid IANA name is accepted
// programmatically (via setTimezone) — this list just drives the dropdown.
export const TIMEZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "Asia/Bangkok",   label: "ไทย (UTC+7) · Asia/Bangkok" },
  { value: "Asia/Jakarta",   label: "อินโดนีเซีย (UTC+7) · Asia/Jakarta" },
  { value: "Asia/Singapore", label: "สิงคโปร์ (UTC+8) · Asia/Singapore" },
  { value: "Asia/Tokyo",     label: "ญี่ปุ่น (UTC+9) · Asia/Tokyo" },
  { value: "Asia/Kolkata",   label: "อินเดีย (UTC+5:30) · Asia/Kolkata" },
  { value: "Europe/London",  label: "ลอนดอน · Europe/London" },
  { value: "America/New_York", label: "นิวยอร์ก · America/New_York" },
  { value: "UTC",            label: "UTC (เวลาเซิร์ฟเวอร์)" },
];

const STORAGE_KEY = "app-timezone";
const DEFAULT_TZ = "Asia/Bangkok";

type Ctx = {
  timezone: string;
  setTimezone: (tz: string) => void;
  // Format a naive-UTC ISO string from the API in the user's chosen tz.
  formatDate: (iso: string, opts?: Intl.DateTimeFormatOptions) => string;
  formatTime: (iso: string, opts?: Intl.DateTimeFormatOptions) => string;
  formatDateTime: (iso: string, opts?: Intl.DateTimeFormatOptions) => string;
};

const TimezoneCtx = createContext<Ctx | null>(null);

function detectDefault(): string {
  try {
    const auto = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return auto || DEFAULT_TZ;
  } catch {
    return DEFAULT_TZ;
  }
}

export function TimezoneProvider({ children }: { children: React.ReactNode }) {
  const [timezone, setTzState] = useState<string>(DEFAULT_TZ);

  useEffect(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    setTzState(saved || detectDefault());
  }, []);

  const setTimezone = useCallback((tz: string) => {
    setTzState(tz);
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, tz);
  }, []);

  const value = useMemo<Ctx>(() => {
    const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => {
      const d = parseServerTime(iso);
      return d.toLocaleString("th-TH", { timeZone: timezone, ...opts });
    };
    return {
      timezone,
      setTimezone,
      formatDate: (iso, opts) =>
        fmt(iso, { day: "numeric", month: "short", ...opts }),
      formatTime: (iso, opts) =>
        fmt(iso, { hour: "2-digit", minute: "2-digit", ...opts }),
      formatDateTime: (iso, opts) =>
        fmt(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", ...opts }),
    };
  }, [timezone, setTimezone]);

  return <TimezoneCtx.Provider value={value}>{children}</TimezoneCtx.Provider>;
}

export function useTimezone(): Ctx {
  const ctx = useContext(TimezoneCtx);
  if (!ctx) throw new Error("useTimezone must be used inside <TimezoneProvider>");
  return ctx;
}
