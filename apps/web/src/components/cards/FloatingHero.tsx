"use client";

import { useQuery } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { api, type SessionSummaryOut } from "@/lib/api";
import { useUnits } from "@/lib/units";
import { useTimezone } from "@/lib/timezone";
import { useT } from "@/lib/i18n";
import { backendLabelToZone, LABEL_STYLE, LABEL_TH, LABEL_EN, LABEL_RANGE, RANGE_REFERENCE_TH, RANGE_REFERENCE_EN } from "@/lib/riskLabel";
import { StatNumber } from "@/components/ui/StatNumber";
import { AcetoneRing } from "@/components/cards/AcetoneRing";
import { InfoButton } from "@/components/ui/InfoButton";

// Same 5-zone order LABEL_RANGE/LABEL_TH/LABEL_EN all share — iterating this
// instead of hand-typing boundary text keeps the InfoButton's zone list from
// drifting out of sync with riskLabel.ts's actual thresholds (it previously
// had a hand-typed copy that didn't match).
const ZONE_ORDER = ["fed_resting", "transitional", "fat_oxidation", "extended_fast", "safety_alert"] as const;

type HeroState = "needsDevice" | "needsCheckIn" | "resultShown";

interface Props {
  deviceId: string | null | undefined;
  state: HeroState;
  /** One-shot pulse the instant a fresh reading lands (see Home's
   *  justRevealed flag) — not a loop. */
  justRevealed?: boolean;
  /** Shared 365-day session list from page.tsx (one request, several
   *  callers) — used as the historical fallback when today has no
   *  reading, instead of showing a bare "—". */
  recentSessions: SessionSummaryOut[] | undefined;
}

/**
 * Home's top zone — a card-less "floating" hero: a zone-color radial gauge
 * (AcetoneRing, revived from dead code) beside a huge number, no
 * background/border/shadow, sitting directly on the page. Replaces
 * HomeHero.tsx's card-based presentation (kept in the repo, unused, for an
 * easy revert rather than deleted — see the plan file for why).
 */
export function FloatingHero({ deviceId, state, justRevealed, recentSessions }: Props) {
  const { format: fmtAcetone, label: unitLbl } = useUnits();
  const { formatTime, formatRelativeDate } = useTimezone();
  const { t, locale } = useT();
  const ZONE_LABEL = locale === "th" ? LABEL_TH : LABEL_EN;

  const showingToday = state === "resultShown";

  const { data: todayReadings } = useQuery({
    queryKey: ["sensor-readings", deviceId, "home-hero-today"],
    queryFn: () => api.sensor.getReadings(deviceId!, 1, 0),
    enabled: !!deviceId && showingToday,
    refetchInterval: 60_000,
  });

  const todayLatest = [...(todayReadings ?? [])].reverse().find((r) => r.acetone_delta != null) ?? null;

  // Historical fallback — the most recent session at all, any age — used
  // whenever today itself has nothing, instead of a bare "—". Only when
  // this is also empty is there genuinely no data to show.
  const fallbackSession = !showingToday ? recentSessions?.[0] ?? null : null;
  const isTrulyEmpty = !showingToday && (recentSessions?.length ?? 0) === 0;

  const displayRawMv = showingToday ? todayLatest?.acetone_delta ?? null : fallbackSession?.peak_acetone_delta ?? null;
  const displayLabel = showingToday ? todayLatest?.label ?? null : fallbackSession?.dominant_label ?? null;
  const displayTime = showingToday ? todayLatest?.time ?? null : fallbackSession?.started_at ?? null;
  const hasDisplayValue = showingToday ? todayLatest != null : fallbackSession != null;

  const zone = backendLabelToZone(displayLabel);
  const style = LABEL_STYLE[zone] ?? LABEL_STYLE.unreliable;

  const statusPill =
    state === "needsDevice" ? t("health.hero.noDevice") : state === "needsCheckIn" ? t("health.hero.notCheckedIn") : null;

  // A historical fallback reading (real data, just not from today) used to
  // render at identical full-color prominence to a fresh one — the only
  // "this is old" signal was a small secondary pill easy to miss in a
  // screenshot, reading as if the hero and the "Not checked in" pill next
  // to it contradicted each other. Desaturating the color here (ring, stat
  // number, zone pill) makes a stale reading visually read as stale.
  const isStaleFallback = !showingToday && hasDisplayValue;
  const displayColor = isStaleFallback
    ? `color-mix(in srgb, ${style.color} 35%, var(--color-text-disabled))`
    : style.color;

  // Ambient halo — tracks the ring's own zone color rather than a fixed
  // brand hue, so it never clashes with a red/orange safety-zone reading.
  // Dim gray (LABEL_STYLE.unreliable) in the true-empty state.
  const haloColor = hasDisplayValue ? displayColor : LABEL_STYLE.unreliable.color;

  return (
    <div className="flex items-center gap-5 sm:gap-8 py-8 sm:py-10 relative">
      <div className="absolute top-0 right-0">
        <InfoButton title={t("health.hero.infoTitle")} ariaLabel={t("health.hero.infoAriaLabel")}>
          <p>{t("health.hero.infoIntro")}</p>
          <p className="text-text-muted">{t("health.hero.infoWhat")}</p>
          <div className="bg-bg-elevated rounded-xl p-3 space-y-2">
            <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">{t("health.hero.infoZonesLabel")}</p>
            <ul className="text-xs space-y-1">
              {ZONE_ORDER.map((z) => (
                <li key={z}>
                  • <b>{LABEL_RANGE[z]}</b> {ZONE_LABEL[z]}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-text-muted">{t("health.hero.infoFooter")}</p>
          <p className="text-xs text-text-disabled">{locale === "th" ? RANGE_REFERENCE_TH : RANGE_REFERENCE_EN}</p>
        </InfoButton>
      </div>

      <div className="relative shrink-0">
        <div
          className="absolute inset-0 m-auto rounded-full blur-3xl -z-10 animate-halo-breathe"
          style={{ width: 160, height: 160, backgroundColor: `color-mix(in srgb, ${haloColor} 15%, transparent)` }}
          aria-hidden="true"
        />
        {/* Desaturate + dim the ring itself for a stale historical fallback
            (AcetoneRing derives its own color from `label` internally, so a
            filter is the contained way to mute it without changing that
            shared component's API for every other caller). */}
        <div className={isStaleFallback ? "opacity-75 saturate-50" : undefined}>
          <AcetoneRing value={displayRawMv} label={displayLabel} size={140} hideText pulse={justRevealed && showingToday} />
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <StatNumber
            value={hasDisplayValue ? fmtAcetone(displayRawMv ?? 0) : isTrulyEmpty ? "--.--" : "—"}
            size="hero"
            color={hasDisplayValue ? displayColor : undefined}
          />
          {hasDisplayValue && <span className="text-lg font-medium text-text-muted">{unitLbl}</span>}
        </div>

        {isTrulyEmpty ? (
          <p className="text-sm text-text-muted mt-2">{t("health.hero.firstCheckIn")}</p>
        ) : (
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {/* Stale-fallback age comes FIRST and reads more assertively
                (text-primary, not text-muted) than the other pills here —
                promoted from a small secondary line below the row so it
                can't be missed next to a "Not checked in" pill the way it
                could when it was easy to miss underneath. */}
            {isStaleFallback && fallbackSession && displayTime && (
              <span className="inline-flex items-center gap-1 rounded-full bg-bg-raised px-2.5 py-1 text-xs font-semibold text-text-primary">
                <Clock size={11} strokeWidth={2} />
                {formatRelativeDate(displayTime)} • {formatTime(displayTime)}
              </span>
            )}
            {hasDisplayValue && displayLabel && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{ color: displayColor, backgroundColor: `color-mix(in srgb, ${displayColor} 15%, transparent)` }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: displayColor }} />
                {ZONE_LABEL[zone] ?? displayLabel}
              </span>
            )}
            {statusPill && (
              <span className="inline-flex items-center rounded-full bg-bg-raised px-2.5 py-1 text-xs font-semibold text-text-muted">
                {statusPill}
              </span>
            )}
            {showingToday && displayTime && (
              <span className="inline-flex items-center gap-1 rounded-full bg-bg-raised px-2.5 py-1 text-xs font-semibold text-text-muted">
                <Clock size={11} strokeWidth={2} />
                {formatTime(displayTime)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
