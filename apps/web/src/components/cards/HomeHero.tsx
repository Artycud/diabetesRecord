"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Cpu, ChevronRight, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { InfoButton } from "@/components/ui/InfoButton";
import { BreathPulse } from "@/components/ui/BreathPulse";
import { AcetoneTrendChart } from "@/components/cards/AcetoneTrendChart";
import { useAcetoneWeeklyMetrics } from "@/components/cards/AcetoneMetricsGrid";
import { DeviceStatusSheet } from "@/components/DeviceStatusSheet";
import { useDemoMode } from "@/lib/demoMode";
import { api } from "@/lib/api";
import { useUnits } from "@/lib/units";
import type { LiveReading } from "@/lib/useDeviceStream";

/** Small bordered inset stat, used side-by-side inside the hero card for
 *  "vs previous" / "7-day avg" — keeps these as glance-able context rather
 *  than a second full-height section, avoiding the height imbalance the
 *  desktop layout was fixed for last round. */
function InsetStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-0 rounded-xl border border-border-soft bg-bg-elevated px-3 py-2.5">
      <p className="text-[10px] text-text-muted font-semibold uppercase tracking-wider whitespace-nowrap">
        {label}
      </p>
      {children}
    </div>
  );
}

interface Props {
  deviceId: string | null | undefined;
  hasReadingToday: boolean;
  liveConnected: boolean;
  liveReading: LiveReading | null | undefined;
  flexScore?: number | null;
  flexColor?: string | null;
  showFlex?: boolean;
  /** True for one beat right after a fresh reading lands — pulses the ring
   *  and is the only time the reveal should feel like "something happened"
   *  rather than a number quietly updating. */
  justRevealed?: boolean;
  /** A streak milestone was crossed by today's check-in. */
  celebrate?: boolean;
}

/**
 * Home's single hero — the one primary "how am I doing / what do I do next"
 * surface on the page. Replaces what used to be two separate cards (a
 * state-based reading/CTA card, plus a standalone daily-check-in banner)
 * that both independently pointed at /breathing — merging them removes that
 * duplicate CTA and gets Home down to its target card count.
 *
 * Three states, one Card shell: needs-device, needs-check-in, result-shown.
 * The inner content is keyed by state so it cross-fades in on a state
 * change instead of the card visibly jumping.
 */
export function HomeHero({
  deviceId,
  hasReadingToday,
  liveConnected,
  liveReading,
  flexScore,
  flexColor,
  showFlex,
  justRevealed,
  celebrate,
}: Props) {
  const { demoMode } = useDemoMode();
  const { format: fmtAcetone, label: unitLbl } = useUnits();

  const state: "needsDevice" | "needsCheckIn" | "resultShown" =
    hasReadingToday ? "resultShown" : !deviceId && !demoMode ? "needsDevice" : "needsCheckIn";

  const hour = new Date().getHours();
  const timeGreeting = hour < 11 ? "Good morning" : hour < 17 ? "This afternoon" : "This evening";

  // Eyebrow sits ABOVE the card, matching the site-wide "label above the
  // group it describes" pattern (Details, Today's sessions) rather than
  // living inside the card's own padding.
  const eyebrow = state === "resultShown" ? "TODAY'S PEAK ACETONE" : "ACTION NEEDED";

  // "vs previous" inset stat — the last 2 sessions is all this needs, kept
  // as its own tiny query rather than prop-drilling page.tsx's larger
  // 30-session fallback list down through Home just for this.
  const { data: recentSessions } = useQuery({
    queryKey: ["sensor", "sessions", "hero-compare"],
    queryFn: () => api.sensor.getSessions(2),
    enabled: state === "resultShown",
  });
  const [latestSession, previousSession] = recentSessions ?? [];
  const vsPreviousMv =
    latestSession?.peak_acetone_delta != null && previousSession?.peak_acetone_delta != null
      ? latestSession.peak_acetone_delta - previousSession.peak_acetone_delta
      : null;

  const weekly = useAcetoneWeeklyMetrics(deviceId);

  return (
    <div key={state} className="space-y-2 animate-hero-fade">
      <p className="text-xs text-mint-500 font-semibold uppercase tracking-widest px-1">
        {eyebrow}
      </p>
      <Card padding="lg" className="flex flex-col items-center gap-3 relative overflow-hidden">
        {/* Subtle icy wash in the corner — echoes the reference design's
            card texture without needing a separate dark-mode-only glow
            variant; a low-opacity accent tint reads fine in both themes. */}
        <div
          className="absolute -top-10 -right-10 h-40 w-40 rounded-full pointer-events-none"
          style={{ background: "radial-gradient(circle, var(--color-mint-500) 0%, transparent 70%)", opacity: 0.08 }}
          aria-hidden="true"
        />
        <div className="absolute top-3 right-3">
          <InfoButton title="Breath Acetone" ariaLabel="รายละเอียด Breath Acetone">
            <p>
              แนวโน้ม <b>breath acetone</b> ของวันนี้ (หรือช่วงล่าสุดที่มีข้อมูล ถ้าวันนี้ยังไม่ได้ตรวจ)
            </p>
            <p className="text-text-muted">
              acetone คือสารระเหยที่ร่างกายผลิตเมื่อเผาไขมัน — ยิ่งสูง ยิ่งอยู่ในสถานะ ketosis
            </p>
            <div className="bg-bg-elevated rounded-xl p-3 space-y-2">
              <p className="text-xs text-text-muted font-semibold uppercase tracking-widest">โซนตามค่า (ppm)</p>
              <ul className="text-xs space-y-1">
                <li>• <b>&lt; 2</b> fed_resting — เผาน้ำตาลเป็นหลัก</li>
                <li>• <b>2–8</b> Fat-Burn Zone</li>
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

        {state === "resultShown" ? (
          <>
            <AcetoneTrendChart deviceId={deviceId} size="hero" pulse={justRevealed} />
            <DeviceStatusSheet deviceId={deviceId} liveConnected={liveConnected} liveReading={liveReading} />

            <div className="w-full flex gap-2.5">
              <InsetStat label="Vs Previous">
                {vsPreviousMv != null ? (
                  <div className="flex items-center gap-1 mt-0.5 text-text-primary">
                    {vsPreviousMv > 0 ? (
                      <ArrowUpRight size={13} className="text-text-muted" />
                    ) : vsPreviousMv < 0 ? (
                      <ArrowDownRight size={13} className="text-text-muted" />
                    ) : (
                      <Minus size={13} className="text-text-muted" />
                    )}
                    <span className="text-sm font-bold">{fmtAcetone(Math.abs(vsPreviousMv))}</span>
                  </div>
                ) : (
                  <p className="text-sm text-text-disabled mt-0.5">—</p>
                )}
              </InsetStat>
              <InsetStat label="7-Day Avg">
                {weekly.avg7 != null ? (
                  <p className="text-sm font-bold text-text-primary mt-0.5">
                    {fmtAcetone(weekly.avg7)} <span className="text-xs font-normal text-text-muted">{unitLbl}</span>
                  </p>
                ) : (
                  <p className="text-sm text-text-disabled mt-0.5">—</p>
                )}
              </InsetStat>
            </div>

            {celebrate && (
              <div className="flex items-center gap-1.5 rounded-full bg-gold-500/15 px-3 py-1 text-xs font-semibold text-gold-700 dark:text-gold-300">
                🎉 Streak milestone! New badge unlocked.
              </div>
            )}

            {showFlex && flexScore != null && flexColor && (
              <Link
                href="/trends"
                className="flex items-center gap-1.5 rounded-full bg-bg-raised px-3 py-1.5 mt-1"
              >
                <span className="text-xs text-text-muted">Flex</span>
                <span className="text-sm font-bold" style={{ color: flexColor }}>
                  {flexScore}
                </span>
                <ChevronRight size={12} className="text-text-disabled" />
              </Link>
            )}
          </>
        ) : state === "needsDevice" ? (
          <>
            <div className="w-full flex items-center gap-4 py-1">
              <div className="h-16 w-16 rounded-full bg-bg-raised flex items-center justify-center shrink-0">
                <Cpu size={26} className="text-text-muted" strokeWidth={1.6} />
              </div>
              <div className="min-w-0 text-left">
                <p className="text-sm font-semibold text-text-primary">No device paired yet</p>
                <p className="text-xs text-text-muted mt-0.5">
                  Connect your MetaBreath device to start tracking today&apos;s acetone.
                </p>
              </div>
            </div>
            <Link
              href="/me/device/add"
              className="inline-flex items-center justify-center rounded-full bg-text-primary text-bg-primary text-sm font-semibold px-5 py-2.5 hover:opacity-90 transition-opacity"
            >
              Add device
            </Link>
          </>
        ) : (
          <>
            <div className="w-full flex items-center gap-4 py-1">
              <BreathPulse size={56} />
              <div className="min-w-0 text-left">
                <p className="text-sm font-semibold text-text-primary">Time for today&apos;s breath check</p>
                <p className="text-xs text-text-muted mt-0.5">
                  {timeGreeting} is a great time to check in.
                </p>
              </div>
            </div>
            <Link
              href="/breathing"
              className="inline-flex items-center justify-center rounded-full bg-text-primary text-bg-primary text-sm font-semibold px-5 py-2.5 hover:opacity-90 transition-opacity"
            >
              Start
            </Link>
          </>
        )}
      </Card>
    </div>
  );
}
