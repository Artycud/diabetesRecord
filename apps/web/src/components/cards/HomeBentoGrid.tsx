"use client";

import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, Minus, Wind, Cpu, Gauge } from "lucide-react";
import { type SessionSummaryOut } from "@/lib/api";
import { useUnits, convertFromMv } from "@/lib/units";
import { useTimezone } from "@/lib/timezone";
import { useT } from "@/lib/i18n";
import { useAcetoneWeeklyMetrics } from "@/components/cards/AcetoneMetricsGrid";
import { FlameGlyph } from "@/components/StreakChip";
import { BentoTile } from "@/components/ui/BentoTile";
import { Sparkline } from "@/components/ui/Sparkline";

type HeroState = "needsDevice" | "needsCheckIn" | "resultShown";

interface Props {
  deviceId: string | null | undefined;
  state: HeroState;
  streakCurrent: number | undefined;
  /** Shared 365-day session list from page.tsx — same data FloatingHero's
   *  fallback uses, so Tile 1's comparison isn't bounded to a short
   *  calendar window and Tile 3 can fall back to it too. */
  recentSessions: SessionSummaryOut[] | undefined;
}

const NEUTRAL_COLOR = "#8E8E93";

/** Small static "faint elegant" wave — stands in for the real sparkline
 *  when there's fewer than 2 comparable sessions, same footprint as the
 *  real chart so the tile doesn't reflow between states. */
function PlaceholderWave() {
  return (
    <svg
      width="100%"
      height={36}
      viewBox="0 0 100 36"
      preserveAspectRatio="none"
      className="text-border-strong mt-1"
      aria-hidden="true"
    >
      <path
        d="M0,20 C8,8 17,8 25,20 C33,32 42,32 50,20 C58,8 67,8 75,20 C83,32 92,32 100,20"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.5}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** 7-bar micro chart — built from real per-day averages when any exist
 *  (including a partial week), normalized to the tallest bar. Falls back
 *  to a uniform faint row (never fabricated heights) only when there's
 *  truly no data for the window. */
function MicroBars({ points }: { points: { x: string; y: number }[] }) {
  if (points.length === 0) {
    return (
      <div className="flex items-end gap-0.5 h-6 mt-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex-1 h-2 rounded-sm bg-border-soft" />
        ))}
      </div>
    );
  }
  const max = Math.max(...points.map((p) => p.y), 0.001);
  return (
    <div className="flex items-end gap-0.5 h-6 mt-1.5">
      {points.map((p, i) => (
        <div
          key={`${p.x}-${i}`}
          className="flex-1 rounded-sm bg-mint-500/60"
          style={{ height: `${Math.max(12, (p.y / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/**
 * Home's bottom zone — 2x2 bento grid replacing HomeStatsPillBar (kept in
 * the repo, unused, for an easy revert rather than deleted). Tile 2 (the
 * primary CTA) is always rendered, relabeled once there's a reading today,
 * so the grid never shows a blank quadrant in the most common state.
 */
export function HomeBentoGrid({ deviceId, state, streakCurrent, recentSessions }: Props) {
  const { format: fmtAcetone, unit: acUnit, label: unitLbl } = useUnits();
  const { formatRelativeDate } = useTimezone();
  const { t } = useT();

  const [latestSession, previousSession] = recentSessions ?? [];
  const vsPreviousMv =
    latestSession?.peak_acetone_delta != null && previousSession?.peak_acetone_delta != null
      ? latestSession.peak_acetone_delta - previousSession.peak_acetone_delta
      : null;
  const sparkPoints =
    previousSession?.peak_acetone_delta != null && latestSession?.peak_acetone_delta != null
      ? [
          { x: previousSession.started_at, y: convertFromMv(previousSession.peak_acetone_delta, acUnit) },
          { x: latestSession.started_at, y: convertFromMv(latestSession.peak_acetone_delta, acUnit) },
        ]
      : [];

  const weekly = useAcetoneWeeklyMetrics(deviceId);
  // Real 7-day average when there's enough recent data; otherwise the
  // single most recent reading (any age) rather than a fabricated number —
  // same fallback source/shape as FloatingHero's.
  const avgFallback = weekly.avg7 == null ? recentSessions?.[0] ?? null : null;

  const ctaHref = state === "needsDevice" ? "/me/device/add" : "/breathing";
  const ctaLabel =
    state === "needsDevice" ? t("health.bento.addDevice") : state === "resultShown" ? t("health.bento.checkInAgain") : t("health.bento.start");
  const CtaIcon = state === "needsDevice" ? Cpu : Wind;

  return (
    <div className="grid grid-cols-2 gap-3">
      <BentoTile>
        <p className="text-[11px] text-text-muted font-semibold uppercase tracking-wider">{t("health.bento.vsPrevious")}</p>
        {vsPreviousMv != null ? (
          <>
            <div className="flex items-center gap-1 mt-1 text-text-primary">
              {vsPreviousMv > 0 ? (
                <ArrowUpRight size={14} className="text-text-muted" />
              ) : vsPreviousMv < 0 ? (
                <ArrowDownRight size={14} className="text-text-muted" />
              ) : (
                <Minus size={14} className="text-text-muted" />
              )}
              <span className="text-lg font-bold">{fmtAcetone(Math.abs(vsPreviousMv))}</span>
              <span className="text-xs font-normal text-text-muted">{unitLbl}</span>
            </div>
            {sparkPoints.length >= 2 ? (
              <div className="flex-1 mt-1">
                <Sparkline data={sparkPoints} color={NEUTRAL_COLOR} height={36} />
              </div>
            ) : (
              <PlaceholderWave />
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-text-disabled mt-2">{t("health.bento.notEnoughHistory")}</p>
            <PlaceholderWave />
          </>
        )}
      </BentoTile>

      <Link href={ctaHref} className="group active:scale-95 transition-transform">
        <BentoTile
          className="items-center justify-center text-center gap-2 h-full border-transparent group-hover:scale-[1.02] transition-transform"
          style={{
            background: "linear-gradient(135deg, var(--color-mint-600), var(--color-mint-700))",
            boxShadow: "0 12px 32px color-mix(in srgb, var(--color-mint-600) 35%, transparent)",
          }}
        >
          <div className="h-14 w-14 rounded-full bg-white text-mint-700 shadow-md flex items-center justify-center animate-cta-pulse">
            <CtaIcon size={22} strokeWidth={2} />
          </div>
          <p className="text-sm font-semibold text-white mt-1">{ctaLabel}</p>
        </BentoTile>
      </Link>

      <BentoTile>
        <div className="flex items-center gap-1.5">
          <Gauge size={13} className="text-text-muted" />
          <p className="text-[11px] text-text-muted font-semibold uppercase tracking-wider">{t("health.bento.weeklyAvg")}</p>
        </div>
        {weekly.avg7 != null ? (
          <>
            <p className="text-2xl font-bold text-text-primary mt-1">
              {fmtAcetone(weekly.avg7)} <span className="text-xs font-normal text-text-muted">{unitLbl}</span>
            </p>
            <MicroBars points={weekly.sparkPoints} />
          </>
        ) : avgFallback ? (
          <>
            <p className="text-2xl font-bold text-text-primary mt-1">
              {fmtAcetone(avgFallback.peak_acetone_delta ?? 0)} <span className="text-xs font-normal text-text-muted">{unitLbl}</span>
            </p>
            <p className="text-[11px] text-text-disabled mt-0.5">
              {t("health.bento.asOf", { relative: formatRelativeDate(avgFallback.started_at) })}
            </p>
          </>
        ) : (
          <>
            <p className="text-sm text-text-disabled italic mt-2">{t("health.bento.noData")}</p>
            <MicroBars points={[]} />
          </>
        )}
      </BentoTile>

      <BentoTile>
        <p className="text-[11px] text-text-muted font-semibold uppercase tracking-wider">{t("health.bento.streak")}</p>
        <div className="flex items-center gap-1.5 mt-1">
          <FlameGlyph current={streakCurrent} size={20} />
          <span className="text-2xl font-bold text-text-primary">{streakCurrent ?? 0}</span>
        </div>
      </BentoTile>
    </div>
  );
}
