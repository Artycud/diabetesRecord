"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { MessageCircle, ChevronRight, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useDeviceStream } from "@/lib/useDeviceStream";
import { useDemoMode } from "@/lib/demoMode";
import { parseServerTime } from "@/lib/time";
import { convertFromMv, useUnits } from "@/lib/units";
import { flexScoreStyle } from "@/lib/riskLabel";
import { ZONES, zoneOf } from "@/components/cards/AcetoneZoneCard";
import { TodayMetricCard } from "@/components/cards/TodayMetricCard";
import { TrendClassCard } from "@/components/cards/TrendClassCard";
import { BaselineCard } from "@/components/cards/BaselineCard";
import { InfoButton } from "@/components/ui/InfoButton";
import { StatNumber } from "@/components/ui/StatNumber";
import { Card } from "@/components/ui/card";
import { Banner } from "@/components/ui/Banner";
import { BreathPulse } from "@/components/ui/BreathPulse";
import { SuggestedQuestionChip } from "@/components/ai/SuggestedQuestionChip";
import { PlusMenu } from "@/components/nav/PlusMenu";

function SectionHeader({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">{children}</p>
      {action}
    </div>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const { t, locale } = useT();
  const initial = (user?.profile?.display_name ?? user?.username ?? "U")[0]?.toUpperCase() ?? "U";
  const { reading: liveReading } = useDeviceStream(user?.id);
  const { format: fmtAcetone, label: unitLbl } = useUnits();
  const { demoMode } = useDemoMode();

  const liveConnected = !!liveReading &&
    (Date.now() - parseServerTime(liveReading.time).getTime() < 60_000);

  const { data: streak } = useQuery({ queryKey: ["me", "streak"], queryFn: api.gamification.getStreak });
  const { data: xp }     = useQuery({ queryKey: ["me", "xp"],     queryFn: api.gamification.getXP });

  const { data: devices } = useQuery({ queryKey: ["sensor", "devices"], queryFn: api.sensor.listDevices });
  const { data: sharedDevices } = useQuery({ queryKey: ["sensor", "shared-devices"], queryFn: api.sensor.listSharedDevices, refetchInterval: 30_000 });
  // Fallback for shared-device users who released their claim: use last recorded device
  const { data: recentSessions } = useQuery({
    queryKey: ["sensor", "sessions", "home-fallback"],
    queryFn: () => api.sensor.getSessions(30),
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
  const heroValue = today?.max_acetone_delta ?? null;
  const heroCount = today?.count ?? 0;
  const hasReadingToday = heroCount > 0;

  const { data: flexData } = useQuery({
    queryKey: ["ai", "flexibility", deviceId],
    queryFn:  () => api.ai.getFlexibility(deviceId!, undefined, 14),
    enabled:  !!deviceId && hasReadingToday,
    staleTime: 5 * 60 * 1000,
  });

  // Inline AI tip for the hero card — same endpoint AiInterpretCard uses
  // elsewhere, just folded directly into the hero instead of its own box.
  const { data: aiInterpret } = useQuery({
    queryKey: ["ai", "interpret", deviceId, "home", heroCount],
    queryFn:  () => api.ai.interpret(deviceId!),
    enabled:  !!deviceId && hasReadingToday,
    staleTime: 60 * 1000,
  });

  const dateLocale = locale === "th" ? "th-TH" : "en-US";
  const dateStr = new Date().toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" });
  const hour = new Date().getHours();
  const timeGreeting = hour < 11 ? "Good morning" : hour < 17 ? "This afternoon" : "This evening";

  const ppm = heroValue != null ? convertFromMv(heroValue, "ppm") : null;
  const zone = ppm != null ? zoneOf(ppm) : null;
  const flexStyle = flexData ? flexScoreStyle(flexData.score) : null;
  // Fires once, right after a check-in crosses a streak milestone.
  const justCrossedMilestone = !!streak && [7, 30, 100].includes(streak.current);

  return (
    <div className="w-full px-4 sm:px-6 md:max-w-2xl md:mx-auto lg:max-w-3xl pt-5 pb-tabbar space-y-6">
      {/* Header — native large-title style */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-text-muted">{dateStr}</p>
          <h1 className="text-[28px] font-bold text-text-primary leading-tight mt-0.5">{t("health.title")}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0 mt-1">
          <Link
            href="/chat"
            aria-label="AI assistant"
            className="h-9 w-9 rounded-full flex items-center justify-center text-text-muted hover:text-mint-500 hover:bg-bg-raised transition-colors"
          >
            <MessageCircle size={20} strokeWidth={1.8} />
          </Link>
          {streak && (
            <span className="text-xs font-semibold bg-bg-raised rounded-full px-2.5 py-1.5 whitespace-nowrap">
              🔥{streak.current}{xp ? ` · Lv.${xp.level}` : ""}
            </span>
          )}
          <Link
            href="/me"
            aria-label="Profile"
            className="h-9 w-9 rounded-full bg-mint-500/20 flex items-center justify-center text-sm font-bold text-mint-500 shrink-0"
          >
            {initial}
          </Link>
        </div>
      </div>

      {/* TODAY'S HIGHLIGHTS */}
      <div>
        <SectionHeader>{t("health.sectionHighlights")}</SectionHeader>
        <div className="space-y-3">
          {hasReadingToday && justCrossedMilestone && (
            <Banner
              variant="celebration"
              title="Streak milestone! 🎉"
              subtitle="New badge unlocked — keep it going."
              className="animate-fade-rise-in"
            />
          )}

          {!hasReadingToday ? (
            <div className="space-y-2">
              <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">
                {t("health.todayCheckLabel")}
              </p>
              <Banner
                icon={<BreathPulse size={48} />}
                title={`${timeGreeting}!`}
                subtitle={
                  deviceId || demoMode
                    ? "Take a 10-second breath test to track your metabolic state."
                    : "No device yet? Try Demo Mode from your profile to see how it works."
                }
                action={
                  <Link
                    href="/breathing"
                    className="inline-flex items-center justify-center rounded-full bg-mint-500 text-white text-sm font-semibold px-4 py-2 hover:bg-mint-400 transition-colors"
                  >
                    {t("health.startCheckin")}
                  </Link>
                }
              />
            </div>
          ) : (
            <Card padding="lg" className="space-y-3 relative">
              <div className="absolute top-4 right-4">
                <InfoButton title="Breath Acetone Zones" ariaLabel="Zone details">
                  <p>ค่า <b>breath acetone สูงสุด</b> ที่วัดได้ใน <b>วันนี้</b></p>
                  <div className="bg-bg-elevated rounded-xl p-3 space-y-2">
                    <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">Zones (ppm)</p>
                    <ul className="text-xs space-y-1">
                      {ZONES.map((z) => (
                        <li key={z.n}>
                          <span style={{ color: z.color }}>●</span>{" "}
                          <b>{z.name}</b> ({z.rangeText}) — {z.desc}
                        </li>
                      ))}
                    </ul>
                  </div>
                </InfoButton>
              </div>

              <div className="flex items-start justify-between gap-3 pr-8">
                <div>
                  <StatNumber value={fmtAcetone(heroValue!)} unit={unitLbl} size="xl" />
                  {zone && (
                    <span
                      className="inline-block mt-2 text-xs font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: `${zone.color}22`, color: zone.color }}
                    >
                      {zone.name}
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {liveConnected && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-mint-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-mint-500 animate-pulse" /> Live
                    </span>
                  )}
                  {flexData && flexStyle && (
                    <p className="text-xs text-text-muted mt-1">
                      Flex <span className="font-bold" style={{ color: flexStyle.color }}>{flexData.score}</span>
                    </p>
                  )}
                </div>
              </div>

              <Link href="/breathing" className="inline-flex items-center gap-0.5 text-xs text-mint-500 font-medium">
                {t("health.showDetails")} <ChevronRight size={12} />
              </Link>

              {aiInterpret?.text && (
                <div className="pt-3 border-t border-border-soft flex gap-2">
                  <Sparkles size={14} className="text-mint-500 shrink-0 mt-0.5" strokeWidth={1.6} />
                  <div className="min-w-0 space-y-2">
                    <p className="text-sm text-text-primary leading-relaxed">{aiInterpret.text}</p>
                    <SuggestedQuestionChip question="ทำไมค่า acetone วันนี้ถึงเป็นแบบนี้?" deviceId={deviceId} />
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Live snapshot — only while actively streaming; the hero above
              already covers "no reading" and "today's peak" states. */}
          {liveReading && (
            <Card padding="md" className="flex items-center gap-3">
              <div className="text-right min-w-[44px]">
                <p className="text-xs text-text-muted">
                  {parseServerTime(liveReading.time).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-text-primary">{fmtAcetone(liveReading.acetone_delta_mv)} {unitLbl}</p>
                <p className="text-xs text-text-muted mt-0.5">
                  {liveReading.pressure_kpa != null && `${liveReading.pressure_kpa.toFixed(2)} kPa · `}
                  Q: {liveReading.quality_score?.toFixed(0)}/100
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* TRENDS — plain and always visible, no expand/collapse toggle */}
      {deviceId && (
        <div>
          <SectionHeader>{t("health.sectionTrends")}</SectionHeader>
          <div className="space-y-3">
            <TrendClassCard deviceId={deviceId} sessions={14} />
            <BaselineCard deviceId={deviceId} />
          </div>
        </div>
      )}

      {/* OTHER METRICS */}
      <div>
        <SectionHeader action={<PlusMenu />}>{t("health.sectionOtherMetrics")}</SectionHeader>
        <div className="grid grid-cols-3 gap-3">
          <TodayMetricCard kind="weight" />
          <TodayMetricCard kind="steps" />
          <TodayMetricCard kind="calories" />
        </div>
      </div>
    </div>
  );
}
