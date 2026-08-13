"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useDeviceStream } from "@/lib/useDeviceStream";
import { useDemoMode } from "@/lib/demoMode";
import { parseServerTime } from "@/lib/time";
import { useUnits } from "@/lib/units";
import { AcetoneMetricsGrid } from "@/components/cards/AcetoneMetricsGrid";
import { TrendClassCard } from "@/components/cards/TrendClassCard";
import { BaselineCard } from "@/components/cards/BaselineCard";
import { AiInterpretCard } from "@/components/cards/AiInterpretCard";
import { FloatingHero } from "@/components/cards/FloatingHero";
import { HomeBentoGrid } from "@/components/cards/HomeBentoGrid";
import { BentoTile } from "@/components/ui/BentoTile";
import { NoDeviceNotice } from "@/components/ui/NoDeviceNotice";
import { HardwareStatusBadge } from "@/components/ui/HardwareStatusBadge";
import { DetailsSection } from "@/components/ui/DetailsSection";
import { StreakChip } from "@/components/StreakChip";
import { QuestMenu } from "@/components/nav/QuestMenu";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export default function HomePage() {
  const { user } = useAuth();
  const { t, locale } = useT();
  const name = user?.profile?.display_name ?? user?.username ?? "—";
  const { reading: liveReading } = useDeviceStream(user?.id);
  const { format: fmtAcetone, label: unitLbl } = useUnits();
  const { demoMode } = useDemoMode();

  const { data: streak } = useQuery({ queryKey: ["me", "streak"], queryFn: api.gamification.getStreak });

  const { data: devices } = useQuery({ queryKey: ["sensor", "devices"], queryFn: api.sensor.listDevices });
  const { data: sharedDevices } = useQuery({ queryKey: ["sensor", "shared-devices"], queryFn: api.sensor.listSharedDevices, refetchInterval: 30_000 });
  // Shared across: shared-device fallback (lastRecordedDeviceId below),
  // FloatingHero's historical fallback when today has no reading, and
  // HomeBentoGrid's Tile 1 (vs-previous) + Tile 3 (avg fallback) — one
  // request instead of each declaring its own overlapping query. 365 is
  // the backend's actual max window (le=365), i.e. "as much history as
  // the API can return," used here as the practical stand-in for
  // "genuinely zero sessions ever."
  const { data: recentSessions } = useQuery({
    queryKey: ["sensor", "sessions", "home-recent"],
    queryFn: () => api.sensor.getSessions(365),
  });
  const lastRecordedDeviceId = recentSessions?.[0]?.device_id;
  const deviceId = devices?.[0]?.id ?? sharedDevices?.find((d) => d.claimed_by_me)?.id ?? lastRecordedDeviceId;
  const { data: dailyStats } = useQuery({
    queryKey: ["sensor", "daily-stats", deviceId, 1],
    queryFn:  () => api.sensor.getDailyStats(deviceId!, 1),
    enabled:  !!deviceId,
    refetchInterval: 30_000,
  });
  const today = dailyStats?.[0];
  const hasReadingToday = (today?.count ?? 0) > 0;

  // Hardware heartbeat for the header badge — same query shape/key as
  // breathing/page.tsx and me/device/page.tsx, so navigating between them
  // shares one cache entry rather than re-polling independently.
  const { data: recStatus } = useQuery({
    queryKey: ["sensor", "recording-status", deviceId],
    queryFn: () => api.sensor.recordingStatus(deviceId!),
    enabled: !!deviceId,
    refetchInterval: 10_000,
  });

  // Drives both FloatingHero and HomeBentoGrid (lifted here since both need
  // it — previously private to HomeHero when it owned both zones).
  const heroState: "needsDevice" | "needsCheckIn" | "resultShown" =
    hasReadingToday ? "resultShown" : !deviceId && !demoMode ? "needsDevice" : "needsCheckIn";

  const dateLocale = locale === "th" ? "th-TH" : "en-US";
  const dateStr = new Date().toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" });

  // Post-breath-check reveal: once a check completes on /breathing, finalize()
  // arms this flag so the next Home load scrolls down to the now-fresh
  // Details section AND pulses the hero's zone ring, instead of the ppm
  // number just quietly updating.
  const detailsRef = useRef<HTMLDivElement>(null);
  const revealConsumed = useRef(false);
  const [justRevealed, setJustRevealed] = useState(false);
  useEffect(() => {
    if (!deviceId || revealConsumed.current) return;
    let raw: string | null = null;
    try { raw = sessionStorage.getItem("mb:justChecked:home"); } catch {}
    if (!raw) return;
    revealConsumed.current = true;
    try { sessionStorage.removeItem("mb:justChecked:home"); } catch {}
    const FRESH_WINDOW_MS = 5 * 60 * 1000;
    if (Date.now() - Number(raw) > FRESH_WINDOW_MS) return;
    setJustRevealed(true);
    const scrollId = setTimeout(() => {
      detailsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 400);
    const pulseId = setTimeout(() => setJustRevealed(false), 1000);
    return () => { clearTimeout(scrollId); clearTimeout(pulseId); };
  }, [deviceId]);

  return (
    // Single centered column, deliberately narrow even on desktop — a
    // tight "widget" feel rather than stretching to fill a wide viewport,
    // which is what a 2-column split (or a too-wide single column) would
    // otherwise invite. See the plan file for the full rationale trail.
    <div className="max-w-md md:max-w-lg mx-auto px-4 py-6 pb-tabbar space-y-5">
      {/* Header — quiet, no chrome competing with the hero below */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] text-mint-600/70 font-bold uppercase tracking-[0.2em]">MetaBreath</p>
          <p className="text-xs text-mint-500 font-semibold uppercase tracking-widest">{t("health.eyebrow")}</p>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary mt-0.5 truncate">
            {t("health.greeting")}, {name}
          </h1>
          <p className="text-xs text-text-muted mt-1">{dateStr}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {deviceId && (
            <HardwareStatusBadge
              online={recStatus?.online}
              readyLabel={t("health.sensorReady")}
              offlineLabel={t("health.sensorOffline")}
            />
          )}
          <StreakChip streak={streak} compact />
          <QuestMenu />
        </div>
      </div>

      {/* Hero — floating, card-less top zone: zone-color radial gauge beside
          the huge number, no background/border/shadow, across the same
          three states as before (needs-device, needs-check-in,
          result-shown). */}
      <FloatingHero deviceId={deviceId} state={heroState} justRevealed={justRevealed} recentSessions={recentSessions} />

      {/* Bento grid — vs-previous, primary CTA (always visible, relabeled
          once there's a reading today so the grid never shows a blank
          quadrant), 7-day average, streak. */}
      <HomeBentoGrid deviceId={deviceId} state={heroState} streakCurrent={streak?.current} recentSessions={recentSessions} />

      {/* AI, integrated — a short interpretation of today's reading plus
          contextual ways to ask more, now as in-card chips that open a
          deep-dive Sheet rather than a floating chatbot or a sibling pill.
          AiInterpretCard handles its own "no device" empty state, so this
          always renders instead of vanishing when deviceId is missing. */}
      <AiInterpretCard
        deviceId={deviceId}
        refreshKey={today?.count ?? 0}
        hasReadingToday={hasReadingToday}
        questions={hasReadingToday ? ["ทำไมค่า acetone วันนี้ถึงเป็นแบบนี้?", "ค่านี้ปกติไหม?"] : undefined}
      />

      {/* Secondary/interpretive detail — quick-glance metrics plus the real
          analysis (trend class, personal baseline), open by default since
          it's the most valuable content on this screen, not an afterthought.
          Each renders in its own floating glass tile (BentoTile), matching
          the bento grid's grammar above, rather than one flat divided card —
          DetailsSection's own children wrapper already supplies the
          space-y-3 stacking gap between them. Always renders — a real empty
          state when there's no device instead of the section disappearing. */}
      <div ref={detailsRef}>
        <DetailsSection title={t("health.detailsTitle")} defaultOpen>
          {deviceId ? (
            <>
              <BentoTile><AcetoneMetricsGrid deviceId={deviceId} bare recentSessions={recentSessions} /></BentoTile>
              <BentoTile><TrendClassCard deviceId={deviceId} sessions={14} bare /></BentoTile>
              <BentoTile><BaselineCard deviceId={deviceId} bare /></BentoTile>
            </>
          ) : (
            <BentoTile className="items-center">
              <NoDeviceNotice description={t("health.detailsNoDevice")} />
            </BentoTile>
          )}
        </DetailsSection>
      </div>

      {/* Today's readings log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-mint-500 font-semibold uppercase tracking-widest">{t("health.todaySessions")}</p>
          <Link href="/trends" className="flex items-center gap-0.5 text-xs text-mint-500">
            {t("health.viewAll")} <ChevronRight size={12} />
          </Link>
        </div>
        {liveReading ? (
          <BentoTile className="flex-row items-center gap-3 min-h-0">
            <div className="text-right min-w-[44px]">
              <p className="text-xs text-text-muted">{parseServerTime(liveReading.time).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-text-primary">{fmtAcetone(liveReading.acetone_delta_mv)} {unitLbl}</p>
              <p className="text-xs text-text-muted mt-0.5">
                {liveReading.pressure_kpa != null && `${liveReading.pressure_kpa.toFixed(2)} kPa · `}
                Q: {liveReading.quality_score?.toFixed(0)}/100
              </p>
            </div>
          </BentoTile>
        ) : (
          <BentoTile className="items-center justify-center text-center min-h-0">
            <p className="text-sm text-text-muted">{t("health.noReadingToday")}</p>
            <Link href="/breathing" className="text-xs text-mint-500 mt-1 block">{t("health.startSession")}</Link>
          </BentoTile>
        )}
      </div>

      <p className="text-center text-[10px] text-text-disabled/50 uppercase tracking-[0.2em] pt-1">
        MetaBreath Biomedical Architecture
      </p>
    </div>
  );
}
