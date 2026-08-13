"use client";

import { Check } from "lucide-react";
import type { StreakOut } from "@/lib/api";
import { useT } from "@/lib/i18n";

type DayStatus = "filled" | "today-filled" | "today-pending" | "empty";
type DaySlot = { date: Date; status: DayStatus };

function isSameCalendarDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function subtractDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

/** "YYYY-MM-DD" -> local midnight Date, not a UTC-shifted parse. */
function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Approximates the last 7 days' streak status from `current`/`last_active_date`
 * alone — the backend has no per-day history endpoint, so this is a
 * documented approximation, not exact history:
 * - Can't distinguish a real completed day from one covered by a streak
 *   freeze (`freezes_left` only tells us a freeze exists, not which day used it).
 * - Can't show a genuine "missed" day inside an active streak — the fill
 *   assumes every one of the trailing `current` days was completed.
 * - If `current` > 7, all 7 visible slots read as filled (the true count is
 *   still shown correctly elsewhere via `current`/`longest`).
 */
function deriveDays(streak: StreakOut, today: Date): DaySlot[] {
  const days: DaySlot[] = Array.from({ length: 7 }, (_, i) => ({
    date: subtractDays(today, 6 - i),
    status: "empty" as DayStatus,
  }));

  if (!streak.last_active_date || streak.current <= 0) {
    days[6].status = "today-pending";
    return days;
  }

  const lastActive = parseDateOnly(streak.last_active_date);
  const filledCount = Math.min(streak.current, 7);
  for (let i = 0; i < filledCount; i++) {
    const target = subtractDays(lastActive, i);
    const slot = days.find((d) => isSameCalendarDay(d.date, target));
    if (slot) slot.status = "filled";
  }

  days[6].status = isSameCalendarDay(lastActive, today) ? "today-filled" : "today-pending";
  return days;
}

interface Props {
  streak: StreakOut;
}

export function StreakMatrix({ streak }: Props) {
  const { t, locale } = useT();
  const dateLocale = locale === "th" ? "th-TH" : "en-US";
  const today = new Date();
  const days = deriveDays(streak, today);
  const filledCount = days.filter((d) => d.status === "filled" || d.status === "today-filled").length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">
          {t("health.streakMatrix.title")}
        </p>
        <p className="text-xs text-text-muted tabular-nums">
          {t("health.streakMatrix.progressLabel", { filled: filledCount })}
        </p>
      </div>

      <div className="flex items-center justify-between px-1">
        {days.map((day, i) => {
          const isFilled = day.status === "filled" || day.status === "today-filled";
          const isTodayPending = day.status === "today-pending";
          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] text-text-disabled uppercase">
                {day.date.toLocaleDateString(dateLocale, { weekday: "narrow" })}
              </span>
              <div
                className={
                  isFilled
                    ? "h-[30px] w-[30px] rounded-full bg-peach-500 flex items-center justify-center"
                    : isTodayPending
                    ? "h-[30px] w-[30px] rounded-full bg-bg-raised border-2 border-peach-500 animate-cta-pulse"
                    : "h-[30px] w-[30px] rounded-full bg-bg-raised"
                }
              >
                {isFilled && <Check size={14} className="text-white" strokeWidth={3} />}
              </div>
            </div>
          );
        })}
      </div>

      <div className="h-1.5 rounded-full bg-bg-raised overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-peach-300 to-peach-500 transition-all duration-700"
          style={{ width: `${(filledCount / 7) * 100}%` }}
        />
      </div>

      {streak.freezes_left > 0 && (
        <p className="text-xs text-text-disabled px-1">
          {t("health.streakMatrix.freezeNote", { count: streak.freezes_left })}
        </p>
      )}
    </div>
  );
}
