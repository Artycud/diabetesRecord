"use client";

import { useEffect, useRef, useState } from "react";
import { Wind, X, RefreshCw, Flame, Star } from "lucide-react";
import { toast } from "sonner";
import { AreaChart, Area, ResponsiveContainer, YAxis } from "recharts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AcetoneLabel, LiveReading } from "@/lib/useDeviceStream";
import { api } from "@/lib/api";
import type { ContextTag } from "@/lib/api";
import { useUnits } from "@/lib/units";
import { LABEL_STYLE, LABEL_TH, backendLabelToZone } from "@/lib/riskLabel";
import { useTimezone } from "@/lib/timezone";
import { ContextSelector } from "./ContextSelector";
import { PreBlowChecklist, type PreBlowAnswers } from "./PreBlowChecklist";

const CALIBRATION_MS = 5_000;
const RECORDING_MS   = 5_000;
const MAX_STORED  = 20;
const MIN_SAMPLES = 2;

function storageKey(userId?: string | null) {
  return userId ? `breath-sessions-${userId}` : "breath-sessions";
}

export interface SessionSummary {
  id: string;
  at: string;
  n_samples: number;
  peak_mv: number;
  mean_mv: number;
  pressure_mean_kpa: number | null;
  quality_score: number | null;
  label: AcetoneLabel | null;
  context_tag: ContextTag | null;
}

export function loadSessions(userId?: string | null): SessionSummary[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(storageKey(userId)) ?? "[]"); }
  catch { return []; }
}

function persist(s: SessionSummary, userId?: string | null) {
  const key = storageKey(userId);
  localStorage.setItem(key, JSON.stringify([s, ...loadSessions(userId)].slice(0, MAX_STORED)));
}

function trimmedMean(vals: number[]): number {
  if (!vals.length) return 0;
  const trim = Math.floor(vals.length * 0.2);
  const end = vals.length - trim;
  const mid = end > trim ? vals.slice(trim, end) : vals;
  return mid.reduce((a, b) => a + b, 0) / mid.length;
}

function modeLabel(samples: LiveReading[]): AcetoneLabel | null {
  const c: Record<string, number> = {};
  for (const s of samples) if (s.label) c[s.label] = (c[s.label] ?? 0) + 1;
  const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
  return (top?.[0] as AcetoneLabel) ?? null;
}

const LABEL_COLOR: Record<string, string> = Object.fromEntries(
  Object.entries(LABEL_STYLE).map(([k, v]) => [k, v.tailwind])
);

// ── Web Audio beeps ─────────────────────────────────────────────────────────
// Single AudioContext, initialised on the START click (user gesture) so iOS
// Safari doesn't reject it.
let audioCtx: AudioContext | null = null;

function primeAudio() {
  if (typeof window === "undefined") return;
  if (!audioCtx) {
    const AC = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx?.state === "suspended") audioCtx.resume();
}

function beep(freq: number, durationMs: number, volume = 0.25) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const now = audioCtx.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + durationMs / 1000);
}

const beepCountdown = () => beep(700, 120);          // 3-2-1 ticks
const beepStart     = () => beep(1000, 300, 0.35);   // recording begins
const beepEnd       = () => beep(600, 500, 0.3);     // recording done

type Phase = "idle" | "calibrating" | "recording" | "done";

const SZ = 112;
const SW = 5;
const RING_R = (SZ - SW) / 2;
const CIRC = 2 * Math.PI * RING_R;

interface Props {
  liveReading: LiveReading | null;
  connected: boolean;
  deviceId: string | null;
  userId?: string | null;
  onSessionSaved?: () => void;
}

export default function BreathSession({ liveReading, connected, deviceId, userId, onSessionSaved }: Props) {
  const { format: fmtAcetone, label: unitLbl } = useUnits();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);   // 0-100 within current phase
  const [result, setResult] = useState<SessionSummary | null>(null);
  const [chartData, setChartData] = useState<{ t: number; mv: number }[]>([]);
  const [showContextSelector, setShowContextSelector] = useState(false);
  const [contextTag, setContextTag] = useState<ContextTag | null>(null);
  const [showChecklist, setShowChecklist] = useState(false);
  const preBlowAnswersRef = useRef<PreBlowAnswers | null>(null);

  const t0 = useRef(0);
  const samplesRef = useRef<LiveReading[]>([]);
  const lastReading = useRef<LiveReading | null>(null);
  const rafId = useRef<number | null>(null);
  const timerIds = useRef<number[]>([]);
  // Session baseline = first sample's raw mv. All subsequent readings are
  // shown relative to it so drift from boot-time firmware baseline cancels out.
  const sessionBaseline = useRef<number | null>(null);
  const onSavedRef = useRef(onSessionSaved);
  useEffect(() => { onSavedRef.current = onSessionSaved; }, [onSessionSaved]);

  function clearScheduled() {
    timerIds.current.forEach((id) => window.clearTimeout(id));
    timerIds.current = [];
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = null;
    }
  }

  // Collect samples only during the recording phase (normalised to session baseline).
  useEffect(() => {
    if (phase !== "recording" || !liveReading || liveReading === lastReading.current) return;
    lastReading.current = liveReading;
    if (sessionBaseline.current === null) {
      sessionBaseline.current = liveReading.acetone_delta_mv;
    }
    samplesRef.current.push(liveReading);
    const normMv = liveReading.acetone_delta_mv - (sessionBaseline.current ?? 0);
    setChartData((prev) => [...prev, { t: prev.length, mv: normMv }]);
  }, [liveReading, phase]);

  // Calibration phase — 10 s countdown, 3-2-1 beeps, transition to recording
  useEffect(() => {
    if (phase !== "calibrating") return;

    t0.current = Date.now();
    setProgress(0);

    timerIds.current.push(window.setTimeout(beepCountdown, CALIBRATION_MS - 3000));
    timerIds.current.push(window.setTimeout(beepCountdown, CALIBRATION_MS - 2000));
    timerIds.current.push(window.setTimeout(beepCountdown, CALIBRATION_MS - 1000));

    const tick = () => {
      const p = Math.min(100, ((Date.now() - t0.current) / CALIBRATION_MS) * 100);
      setProgress(p);
      if (p >= 100) {
        beepStart();
        setPhase("recording");
        return;
      }
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);

    return clearScheduled;
  }, [phase]);

  // Recording phase — startRecording API, 10 s capture, endBeep, stopRecording
  useEffect(() => {
    if (phase !== "recording") return;

    t0.current = Date.now();
    samplesRef.current = [];
    lastReading.current = null;
    sessionBaseline.current = null;
    setChartData([]);
    setProgress(0);

    if (deviceId) {
      api.sensor.startRecording(deviceId).catch(() => {
        toast.error("เริ่ม session ไม่สำเร็จ");
      });
    }

    const tick = () => {
      const p = Math.min(100, ((Date.now() - t0.current) / RECORDING_MS) * 100);
      setProgress(p);
      if (p >= 100) {
        beepEnd();
        finalize();
        return;
      }
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);

    return clearScheduled;
  }, [phase, deviceId]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function finalize() {
    if (deviceId) {
      try { await api.sensor.stopRecording(deviceId); } catch { /* non-critical */ }
    }
    const s = samplesRef.current;
    if (s.length < MIN_SAMPLES) {
      toast.error("ข้อมูลไม่เพียงพอ — ลองเป่าใหม่", { description: `ได้รับเพียง ${s.length} ตัวอย่าง` });
      resetToIdle();
      return;
    }
    // Normalise to the session baseline (first sample) so the peak/mean reflect
    // the rise above ambient, not absolute values relative to the boot-time baseline.
    const base = sessionBaseline.current ?? s[0].acetone_delta_mv;
    const mvs = s.map((r) => r.acetone_delta_mv - base);
    const pressures = s.map((r) => r.pressure_kpa).filter((v): v is number => v != null);
    const qualities = s.map((r) => r.quality_score);

    const summary: SessionSummary = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      n_samples: s.length,
      peak_mv: Math.max(...mvs),
      mean_mv: trimmedMean(mvs),
      pressure_mean_kpa: pressures.length
        ? pressures.reduce((a, b) => a + b, 0) / pressures.length
        : null,
      quality_score: qualities.reduce((a, b) => a + b, 0) / qualities.length,
      label: modeLabel(s),
      context_tag: contextTag,
    };
    persist(summary, userId);
    setResult(summary);
    setPhase("done");
    toast.success("บันทึกเซสชั่นแล้ว");
    onSavedRef.current?.();
    // Invalidate gamification so home/profile show fresh streak + XP
    qc.invalidateQueries({ queryKey: ["me", "xp"] });
    qc.invalidateQueries({ queryKey: ["me", "streak"] });
    qc.invalidateQueries({ queryKey: ["me", "quests"] });
  }

  async function start() {
    if (!connected) {
      toast.error("กรุณาเชื่อมต่ออุปกรณ์ก่อนเริ่มตรวจ", {
        action: { label: "ไปที่ Device", onClick: () => { window.location.href = "/me/device"; } },
      });
      return;
    }
    if (!deviceId) {
      toast.error("ไม่พบอุปกรณ์");
      return;
    }
    primeAudio();  // must run on user gesture (iOS Safari)
    setShowChecklist(true);
  }

  function handleChecklistFinish(answers: PreBlowAnswers | null) {
    preBlowAnswersRef.current = answers;
    setShowChecklist(false);
    if (answers && userId) {
      try {
        localStorage.setItem(
          `preblow-answers-${userId}`,
          JSON.stringify({ at: new Date().toISOString(), answers }),
        );
      } catch { /* storage full — ignore */ }
    }
    setShowContextSelector(true);
  }

  function beginCalibration(tag: ContextTag | null) {
    setContextTag(tag);
    setShowContextSelector(false);
    setPhase("calibrating");
  }

  function resetToIdle() {
    clearScheduled();
    setPhase("idle");
    setProgress(0);
    setResult(null);
    setChartData([]);
    setContextTag(null);
    setShowContextSelector(false);
    samplesRef.current = [];
    lastReading.current = null;
  }

  async function reset() {
    clearScheduled();
    if (deviceId && phase === "recording") {
      try { await api.sensor.stopRecording(deviceId); } catch { /* ignore */ }
    }
    resetToIdle();
  }

  const durMs = phase === "recording" ? RECORDING_MS : CALIBRATION_MS;
  const secsLeft = Math.ceil(durMs / 1000 * (1 - progress / 100));
  const dashOffset = CIRC * (1 - progress / 100);
  // Live display is normalised to session baseline (first sample) so the number
  // tracks the same shape as the waveform, not raw drift-affected delta.
  const rawLive = liveReading?.acetone_delta_mv ?? 0;
  const liveMv = phase === "recording" && sessionBaseline.current !== null
    ? rawLive - sessionBaseline.current
    : rawLive;

  /* ── idle ── */
  if (phase === "idle") {
    return (
      <>
        <div className="flex flex-col items-center py-8">
          <button
            onClick={start}
            className="h-28 w-28 rounded-full bg-mint-500/10 border-2 border-mint-500/40 flex flex-col items-center justify-center gap-2 hover:bg-mint-500/20 active:scale-95 transition-all duration-200"
          >
            <Wind
              size={32}
              className={connected ? "text-mint-500" : "text-text-muted"}
              strokeWidth={1.6}
            />
            <span className={`text-xs font-semibold uppercase tracking-wide ${connected ? "text-mint-500" : "text-text-muted"}`}>
              START
            </span>
          </button>
          <p className="text-xs text-text-muted mt-4">
            {connected ? "กดเพื่อเริ่มการตรวจ" : "เชื่อมต่ออุปกรณ์ก่อนเริ่ม"}
          </p>
        </div>
        {showChecklist && (
          <PreBlowChecklist
            onFinish={handleChecklistFinish}
            onClose={() => setShowChecklist(false)}
          />
        )}
        {showContextSelector && (
          <ContextSelector
            onSelect={(tag) => beginCalibration(tag)}
            onSkip={() => beginCalibration(null)}
          />
        )}
      </>
    );
  }

  /* ── calibrating ── */
  if (phase === "calibrating") {
    const ringColor = "text-blue-400";
    return (
      <div className="flex flex-col items-center py-6 gap-4">
        <div className="relative" style={{ width: SZ, height: SZ }}>
          <svg width={SZ} height={SZ} className="rotate-[-90deg]">
            <circle cx={SZ/2} cy={SZ/2} r={RING_R} fill="none" stroke="currentColor" className="text-blue-500/20" strokeWidth={SW} />
            <circle
              cx={SZ/2} cy={SZ/2} r={RING_R}
              fill="none" stroke="currentColor" className={ringColor}
              strokeWidth={SW} strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={dashOffset}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-blue-400 leading-none">{secsLeft}</span>
            <span className="text-[10px] text-text-muted mt-1 uppercase tracking-widest">Calibrate</span>
          </div>
        </div>

        <div className="text-center">
          <p className="text-sm font-medium text-text-primary">กำลังคาลิเบต</p>
          <p className="text-xs text-text-muted mt-1">
            {secsLeft <= 3 ? "เตรียมเป่า..." : "ถืออุปกรณ์นิ่งๆ"}
          </p>
        </div>

        <button
          onClick={reset}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          <X size={12} />
          ยกเลิก
        </button>
      </div>
    );
  }

  /* ── recording ── */
  if (phase === "recording") {
    const mvVals = chartData.map(d => d.mv);
    const yMin = mvVals.length > 1 ? Math.min(...mvVals) - 5 : 0;
    const yMax = mvVals.length > 1 ? Math.max(...mvVals) + 5 : 50;

    return (
      <div className="flex flex-col items-center py-6 gap-4">
        <div className="relative" style={{ width: SZ, height: SZ }}>
          <svg width={SZ} height={SZ} className="rotate-[-90deg]">
            <circle cx={SZ/2} cy={SZ/2} r={RING_R} fill="none" stroke="currentColor" className="text-mint-500/20" strokeWidth={SW} />
            <circle
              cx={SZ/2} cy={SZ/2} r={RING_R}
              fill="none" stroke="currentColor" className="text-mint-500"
              strokeWidth={SW} strokeLinecap="round"
              strokeDasharray={CIRC} strokeDashoffset={dashOffset}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-mint-500 leading-none">{secsLeft}</span>
            <span className="text-[10px] text-text-muted mt-1">{fmtAcetone(liveMv)} {unitLbl}</span>
          </div>
        </div>

        <p className="text-sm font-semibold text-mint-500">เป่าออกยาวๆ ค้างไว้</p>

        <div className="w-full rounded-2xl bg-bg-elevated overflow-hidden" style={{ height: 96 }}>
          {chartData.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="breathGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00C896" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#00C896" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis domain={[yMin, yMax]} hide />
                <Area
                  type="monotoneX"
                  dataKey="mv"
                  stroke="#00C896"
                  strokeWidth={2}
                  fill="url(#breathGrad)"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center">
              <p className="text-xs text-text-muted">รอสัญญาณ...</p>
            </div>
          )}
        </div>

        <button
          onClick={reset}
          className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
        >
          <X size={12} />
          ยกเลิก
        </button>
      </div>
    );
  }

  /* ── done ── */
  if (!result) return null;
  const resultZone = backendLabelToZone(result.label);
  const lColor = LABEL_COLOR[resultZone] ?? "text-text-muted";
  const lText = LABEL_TH[resultZone] ?? result.label ?? "—";

  return (
    <DoneCard
      result={result}
      lColor={lColor}
      lText={lText}
      fmtAcetone={fmtAcetone}
      unitLbl={unitLbl}
      onReset={reset}
    />
  );
}

/* ── Done result card — shows measurement + live gamification feedback ── */
function DoneCard({
  result, lColor, lText, fmtAcetone, unitLbl, onReset,
}: {
  result: SessionSummary;
  lColor: string;
  lText: string;
  fmtAcetone: (v: number) => string;
  unitLbl: string;
  onReset: () => void;
}) {
  const { data: xpData }     = useQuery({ queryKey: ["me", "xp"],     queryFn: api.gamification.getXP });
  const { data: streakData } = useQuery({ queryKey: ["me", "streak"], queryFn: api.gamification.getStreak });

  return (
    <div className="py-2">
      <div className="bg-bg-elevated rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-text-primary">ผลการตรวจ</p>
          <span className={`text-sm font-bold ${lColor}`}>{lText}</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { val: fmtAcetone(result.peak_mv),              label: `Peak (${unitLbl})` },
              { val: fmtAcetone(result.mean_mv),              label: `Mean (${unitLbl})` },
              { val: result.quality_score?.toFixed(0) ?? "—", label: "Quality" },
            ] as const
          ).map(({ val, label }) => (
            <div key={label} className="bg-bg-raised rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-text-primary">{val}</p>
              <p className="text-[10px] text-text-muted mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {result.pressure_mean_kpa != null && (
          <p className="text-xs text-text-muted text-center">
            แรงดัน {result.pressure_mean_kpa.toFixed(2)} kPa · {result.n_samples} ตัวอย่าง
          </p>
        )}

        {/* Gamification feedback — refreshes after invalidation */}
        {(streakData || xpData) && (
          <div className="bg-mint-500/10 rounded-xl px-3 py-2.5 flex items-center justify-center gap-5">
            {streakData && (
              <div className="flex items-center gap-1.5">
                <Flame size={14} className="text-peach-500" />
                <span className="text-sm font-bold text-text-primary">{streakData.current}</span>
                <span className="text-xs text-text-muted">day streak</span>
              </div>
            )}
            {xpData && (
              <div className="flex items-center gap-1.5">
                <Star size={14} className="text-gold-500" />
                <span className="text-sm font-bold text-text-primary">{xpData.total.toLocaleString()}</span>
                <span className="text-xs text-text-muted">XP total</span>
              </div>
            )}
          </div>
        )}

        <button
          onClick={onReset}
          className="w-full rounded-xl border border-border-soft text-text-muted text-sm py-2.5 flex items-center justify-center gap-2 hover:bg-bg-raised transition-colors"
        >
          <RefreshCw size={14} />
          เป่าใหม่
        </button>
      </div>
    </div>
  );
}

/* ── Recent sessions list (reads from localStorage) ── */
export function RecentBreathSessions({ sessions }: { sessions: SessionSummary[] }) {
  const { format: fmt, label: unitLbl } = useUnits();
  const { formatDate: tzFormatDate, formatTime: tzFormatTime } = useTimezone();
  return (
    <div>
      <p className="text-xs text-text-muted font-semibold uppercase tracking-widest mb-3">
        Recent Sessions
      </p>
      {sessions.length === 0 ? (
        <div className="bg-bg-elevated rounded-2xl p-6 text-center">
          <p className="text-sm text-text-muted">ยังไม่มีประวัติการตรวจ</p>
          <p className="text-xs text-text-disabled mt-1">กดปุ่มเพื่อเริ่มการตรวจครั้งแรก</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => {
            const sZone = backendLabelToZone(s.label);
            const lColor = LABEL_COLOR[sZone] ?? "text-text-muted";
            const lText = LABEL_TH[sZone] ?? s.label ?? "—";
            return (
              <div key={s.id} className="bg-bg-elevated rounded-2xl p-4 flex items-center gap-3">
                <div className="w-14 text-right">
                  <p className="text-xs text-text-muted">{tzFormatTime(s.at)}</p>
                  <p className="text-[10px] text-text-disabled mt-0.5">{tzFormatDate(s.at)}</p>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-text-primary">
                    {fmt(s.peak_mv)} {unitLbl}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    Mean {fmt(s.mean_mv)} · Q{s.quality_score?.toFixed(0) ?? "—"} · {s.n_samples} samples
                  </p>
                </div>
                <span className={`text-xs font-bold ${lColor}`}>{lText}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
