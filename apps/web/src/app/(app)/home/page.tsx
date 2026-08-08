"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useDeviceStream } from "@/lib/useDeviceStream";
import { parseServerTime } from "@/lib/time";
import { useUnits } from "@/lib/units";
import { AcetoneRing } from "@/components/cards/AcetoneRing";
import { FlexibilityBar } from "@/components/FlexibilityBar";
import { LABEL_TH, backendLabelToZone } from "@/lib/riskLabel";
import { TodayMetricCard } from "@/components/cards/TodayMetricCard";
import { CategoryCard } from "@/components/cards/CategoryCard";
import { TrendClassCard } from "@/components/cards/TrendClassCard";
import { InfoButton } from "@/components/ui/InfoButton";
import { StatNumber } from "@/components/ui/StatNumber";
import { Card } from "@/components/ui/card";
import { StreakChip } from "@/components/StreakChip";
import { DailyCheckBanner } from "@/components/DailyCheckBanner";
import { useThemeConfig } from "@/components/theme/ThemeProvider";
import Link from "next/link";
import { ChevronRight, Check, Trophy } from "lucide-react";

export default function HomePage() {
  const { user } = useAuth();
  const { t, locale } = useT();
  const name = user?.profile?.display_name ?? user?.username ?? "—";
  const { reading: liveReading } = useDeviceStream(user?.id);
  const { format: fmtAcetone, label: unitLbl } = useUnits();
  const { cardStyle } = useThemeConfig();
  const [questsOpen, setQuestsOpen] = useState(false);

  const liveConnected = !!liveReading &&
    (Date.now() - parseServerTime(liveReading.time).getTime() < 60_000);

  const { data: streak } = useQuery({ queryKey: ["me", "streak"], queryFn: api.gamification.getStreak });
  const { data: xp }     = useQuery({ queryKey: ["me", "xp"],     queryFn: api.gamification.getXP });
  const { data: quests } = useQuery({ queryKey: ["me", "quests"], queryFn: api.gamification.getQuestsToday });

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

  const { data: flexData, isLoading: flexLoading } = useQuery({
    queryKey: ["ai", "flexibility", deviceId],
    queryFn:  () => api.ai.getFlexibility(deviceId!, undefined, 14),
    enabled:  !!deviceId,
    staleTime: 5 * 60 * 1000,
  });

  const dateLocale = locale === "th" ? "th-TH" : "en-US";
  const dateStr = new Date().toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" });

  const heroValue = today?.max_acetone_delta ?? liveReading?.acetone_delta_mv ?? null;
  const heroLabel = today?.dominant_label ?? liveReading?.label ?? null;
  const heroCount = today?.count ?? 0;

  const questDone  = quests?.filter((q) => q.completed_at).length ?? 0;
  const questTotal = quests?.length ?? 0;
  const breathQuest = quests?.find((q) => q.code === "daily_breath_check");
  const checkedInToday = !!breathQuest?.completed_at;
  // Fires once, right after a check-in crosses a streak milestone — quests
  // refetch (see BreathSession.tsx finalize()) is what makes this update live.
  const justCrossedMilestone = !!streak && [7, 30, 100].includes(streak.current);

  return (
    <div className="max-w-md mx-auto px-4 pt-5 pb-24 space-y-5">
      {/* Greeting */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-text-muted">{dateStr}</p>
          <h1 className="text-xl font-semibold text-text-primary mt-0.5 truncate">
            {t("health.greeting")}, {name}
          </h1>
        </div>
        <StreakChip current={streak?.current} className="shrink-0" />
      </div>

      {/* Daily check-in nudge — the single most important action of the day */}
      <DailyCheckBanner
        checkedInToday={checkedInToday}
        hasDevice={!!deviceId}
        celebrate={checkedInToday && justCrossedMilestone}
      />

      {/* Flexibility Score — Layer 3 hero */}
      <Card padding="lg">
        <div className="flex items-start justify-between mb-4">
          <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">
            Metabolic Flexibility
          </p>
          <InfoButton title="Metabolic Flexibility Score" ariaLabel="รายละเอียด Metabolic Flexibility">
            <p>
              คะแนน <b>0–100</b> ที่บอกว่าระบบเผาผลาญของคุณ <b>ยืดหยุ่น</b> แค่ไหน — สลับระหว่างเผาน้ำตาลกับเผาไขมันได้ดีเพียงใด
            </p>
            <p className="text-text-muted">
              คำนวณจาก breath session ใน <b>14 วันย้อนหลัง</b> (ต้องมีอย่างน้อย 3 sessions)
            </p>
            <div className="bg-bg-elevated rounded-xl p-3 space-y-2">
              <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">3 มิติที่ประกอบเป็นคะแนน</p>
              <ul className="text-xs space-y-1.5">
                <li>• <b>Amplitude (40 pts)</b> — ค่า acetone ครอบคลุมหลายโซนไหม (fed_resting → transitional → fat_oxidation) ยิ่งกว้าง ยิ่งสูง</li>
                <li>• <b>Return Speed (35 pts)</b> — ค่ากลับ baseline เร็วแค่ไหนหลังพีค</li>
                <li>• <b>Appropriateness (25 pts)</b> — ค่า match กับ context ที่เลือก (fasting/post_meal/post_exercise/evening) ไหม</li>
              </ul>
            </div>
            <p className="text-xs text-text-muted">
              เป็น <b>monitoring signal</b> ไม่ใช่การวินิจฉัยทางการแพทย์
            </p>
          </InfoButton>
        </div>
        <FlexibilityBar data={flexData} loading={!!deviceId && flexLoading} hasDevice={!!deviceId} />
      </Card>

      {/* Acetone ring — secondary snapshot */}
      <Card padding="lg" className="flex flex-col items-center gap-3 relative">
        <div className="absolute top-3 right-3">
          <InfoButton title="Breath Acetone · สูงสุดวันนี้" ariaLabel="รายละเอียด Breath Acetone">
            <p>
              ค่า <b>breath acetone สูงสุด</b> ที่วัดได้ใน <b>วันนี้</b> (00:00 – 23:59 ตาม timezone ที่ตั้ง)
            </p>
            <p className="text-text-muted">
              acetone คือสารระเหยที่ร่างกายผลิตเมื่อเผาไขมัน — ยิ่งสูง ยิ่งอยู่ในสถานะ ketosis
            </p>
            <div className="bg-bg-elevated rounded-xl p-3 space-y-2">
              <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">โซนตามค่า (ppm)</p>
              <ul className="text-xs space-y-1">
                <li>• <b>&lt; 2</b> fed_resting — เผาน้ำตาลเป็นหลัก</li>
                <li>• <b>2–8</b> transitional — เริ่มเปลี่ยนไปเผาไขมัน</li>
                <li>• <b>8–40</b> fat_oxidation — เผาไขมันหลัก (keto/exercise)</li>
                <li>• <b>40–75</b> extended_fast — อดอาหารต่อเนื่อง</li>
                <li>• <b>≥ 75</b> safety_alert — สูงผิดปกติ ให้พบแพทย์</li>
              </ul>
            </div>
            <p className="text-xs text-text-muted">
              ค่าเปลี่ยนได้ตามอาหาร, การอดอาหาร, การออกกำลังกาย, ความชื้น และอุณหภูมิ
            </p>
          </InfoButton>
        </div>
        <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">
          BREATH ACETONE · สูงสุดวันนี้
        </p>
        <AcetoneRing value={heroValue} label={heroLabel} size={160} />
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${liveConnected ? "bg-mint-500 animate-pulse" : "bg-text-disabled"}`} />
          <span className="text-xs text-text-muted">
            {liveConnected ? (
              <>Live · MetaBreath {liveReading && `(${fmtAcetone(liveReading.acetone_delta_mv)} ${unitLbl})`}</>
            ) : heroCount > 0 ? (
              <>{t("health.connectDevice") ?? "อุปกรณ์ไม่ได้เชื่อมต่อ"}</>
            ) : (
              <Link href="/me/device" className="underline text-mint-500">
                {t("health.connectDevice")}
              </Link>
            )}
          </span>
        </div>
      </Card>

      {/* Long-term trend classifier (Phase 3 LSTM) */}
      {deviceId && <TrendClassCard deviceId={deviceId} sessions={14} />}

      {/* Quests — streak now lives in the greeting header, not duplicated here */}
      <Card padding="md" className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-mint-500/15 flex items-center justify-center shrink-0">
          <Trophy size={18} className="text-mint-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-text-muted uppercase tracking-wider font-medium">Quests today</p>
          {quests ? (
            <StatNumber value={`${questDone}/${questTotal}`} size="sm" />
          ) : (
            <div className="h-6 w-14 bg-bg-raised rounded-lg animate-pulse mt-0.5" />
          )}
        </div>
        {xp && (
          <div className="text-right shrink-0">
            <p className="text-[10px] text-text-muted">Lv.{xp.level}</p>
            <p className="text-xs font-semibold text-gold-500">{xp.total.toLocaleString()} XP</p>
          </div>
        )}
        {questTotal > 0 && (
          <button
            onClick={() => setQuestsOpen((v) => !v)}
            className="p-2 -m-2 rounded-xl hover:bg-bg-raised transition-colors shrink-0"
            aria-label="Toggle quest details"
          >
            <ChevronRight size={16} className={`text-text-disabled transition-transform duration-200 ${questsOpen ? "rotate-90" : ""}`} />
          </button>
        )}
      </Card>

      {/* Quests expanded panel */}
      {questsOpen && quests && quests.length > 0 && (
        <div className="bg-bg-elevated rounded-2xl p-4 space-y-3 -mt-2">
          <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">Quest วันนี้</p>
          {/* Quests without a wired completion path (only breath-check + article
              currently progress) are muted rather than hidden — honest about
              what's actually trackable today without hiding the roadmap. */}
          {[...quests]
            .sort((a, b) => Number(b.code === "daily_breath_check" || b.code === "daily_article") -
                            Number(a.code === "daily_breath_check" || a.code === "daily_article"))
            .map((q) => {
              const isTrackable = q.code === "daily_breath_check" || q.code === "daily_article";
              return (
                <div key={q.id} className={`flex items-center gap-3 ${!isTrackable && !q.completed_at ? "opacity-40" : ""}`}>
                  <div
                    className={`h-5 w-5 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                      q.completed_at
                        ? "bg-mint-500"
                        : cardStyle === "neumorphic"
                          ? "bg-bg-elevated neu-inset"
                          : "border-2 border-border-strong"
                    }`}
                  >
                    {q.completed_at && <Check size={10} className="text-white" strokeWidth={3} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${q.completed_at ? "text-text-muted line-through" : "text-text-primary"}`}>
                      {q.title}
                    </p>
                    <p className="text-xs text-text-disabled">{q.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-gold-500 font-semibold">+{q.xp_reward} XP</p>
                    <p className="text-[10px] text-text-disabled font-mono">{q.progress}/{q.target}</p>
                  </div>
                </div>
              );
            })}
        </div>
      )}

      {/* Daily entry metrics */}
      <div className="grid grid-cols-3 gap-3">
        <TodayMetricCard kind="weight" />
        <TodayMetricCard kind="steps" />
        <TodayMetricCard kind="calories" />
      </div>

      {/* Category cards */}
      <div>
        <p className="text-xs text-text-muted font-semibold uppercase tracking-widest mb-3">Health</p>
        <div className="grid grid-cols-2 gap-3">
          <CategoryCard
            icon="🌬"
            title="Breathing"
            value={heroValue != null ? `${fmtAcetone(heroValue)} ${unitLbl}` : "—"}
            sub={heroLabel ? (LABEL_TH[backendLabelToZone(heroLabel)] ?? heroLabel) : "ไม่มีข้อมูล"}
            href="/breathing"
            iconBg="#00C896"
          />
          <CategoryCard
            icon="📈"
            title="Trend"
            value="7-day"
            sub="ดูแนวโน้ม"
            href="/trends"
            iconBg="#3B82F6"
          />
          <CategoryCard
            icon="💤"
            title="Sleep"
            value="—"
            iconBg="#A855F7"
            comingSoon
          />
          <CategoryCard
            icon="❤️"
            title="Heart Rate"
            value="—"
            iconBg="#FF3B4A"
            comingSoon
          />
        </div>
      </div>

      {/* Today's readings log */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">{t("health.todaySessions")}</p>
          <Link href="/breathing" className="flex items-center gap-0.5 text-xs text-mint-500">
            {t("health.viewAll")} <ChevronRight size={12} />
          </Link>
        </div>
        {liveReading ? (
          <Card padding="md" className="flex items-center gap-3">
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
          </Card>
        ) : (
          <Card padding="md" className="text-center">
            <p className="text-sm text-text-muted">{t("health.noReadingToday")}</p>
            <Link href="/breathing" className="text-xs text-mint-500 mt-1 block">{t("health.startSession")}</Link>
          </Card>
        )}
      </div>
    </div>
  );
}
