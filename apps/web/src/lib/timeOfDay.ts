export type TimeBucket = "morning" | "afternoon" | "evening" | "night";

/** Coarse time-of-day bucket for contextual copy (e.g. Breathe's idle
 *  subtext) — local wall-clock hour, not timezone-aware beyond that. */
export function getTimeBucket(date: Date = new Date()): TimeBucket {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return "night";
}
