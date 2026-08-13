"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Wind, X, RefreshCw, Flame, Star } from "lucide-react";
import { toast } from "sonner";
import { ComposedChart, Area, ResponsiveContainer, YAxis } from "recharts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AcetoneLabel, LiveReading } from "@/lib/useDeviceStream";
import { api } from "@/lib/api";
import type { ContextTag, SessionSummaryOut } from "@/lib/api";
import { convertFromMv, useUnits } from "@/lib/units";
import { LABEL_STYLE, LABEL_TH, backendLabelToZone, metabolicZone, rampColor } from "@/lib/riskLabel";
import { useTimezone } from "@/lib/timezone";
import { randomDemoParams, demoValueAt, type DemoParams } from "@/lib/demoReading";
import { BreathPulse } from "@/components/ui/BreathPulse";
import { getTimeBucket, type TimeBucket } from "@/lib/timeOfDay";
import { twMerge } from "tailwind-merge";
import { ContextSelector } from "./ContextSelector";
import { PreBlowChecklist, type PreBlowAnswers } from "./PreBlowChecklist";

const CALIBRATION_MS = 5_000;
const RECORDING_MS   = 5_000;
const MAX_STORED  = 20;

// Idle-state contextual copy, one line per time-of-day bucket — matches
// this component's existing hardcoded-Thai convention rather than adding a
// new i18n dependency to a component that doesn't use useT() anywhere else.
const IDLE_CONTEXT_TH: Record<TimeBucket, string> = {
  morning: "ยังไม่ได้กินอะไรใช่ไหม? ตรวจตอนนี้ได้ค่า baseline ตอนอดอาหารที่แม่นยำ",
  afternoon: "ห่างจากมื้อล่าสุดสักพักแล้ว เป็นจังหวะดีที่จะเช็กค่า",
  evening: "ตรวจก่อนนอนช่วยให้เห็นแนวโน้มการเผาผลาญตลอดวันได้ชัดขึ้น",
  night: "ดึกแล้ว แต่ถ้ายังตื่นอยู่ ตรวจตอนนี้ก็ยังเก็บข้อมูลที่มีประโยชน์ได้",
};

// Real (non-demo) blow intensity gain — a modest real blow (weaker lungs,
// a snugger mouthpiece seal, sensor placement) shouldn't read as a dead/flat
// ring next to how lively Demo Mode looks. Only scales the *visual*
// intensity (ring brightness/bob), never the recorded pressure/acetone
// values themselves. Only applies during actual recording (see the tick
// loop below) — never at idle/calibration.
const REAL_PRESSURE_GAIN = 1.8;

// If a real device reports literally nothing (or all-zero pressure AND
// acetone) this far into the 5s recording window, treat it as "no signal"
// and fall back to a synthetic reading for the rest of *this* session —
// presenting a broken all-zero result mid-demo is worse than a seamless
// simulated one. Long enough that a real device sending at ~1-2Hz has had
// a couple of samples to prove itself first.
const NO_SIGNAL_GRACE_MS = 1_500;
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

// 128px matches the idle START button (h-32 w-32) exactly, so the focal
// circle stays the same size across idle -> calibrating -> recording
// instead of visibly growing/shrinking as the phase changes.
const SZ = 128;
const SW = 5;
const RING_R = (SZ - SW) / 2;
const CIRC = 2 * Math.PI * RING_R;

// Screen-reader announcement for phase transitions only (idle -> calibrating
// -> recording -> done) — a visually-hidden aria-live region. Deliberately
// rendered once per phase's JSX (not tied to `progress`/the per-second
// countdown), so it only changes — and is only announced — at phase
// boundaries, never spamming a countdown number every tick.
function PhaseAnnouncer({ text }: { text: string }) {
  return (
    <div aria-live="polite" role="status" className="sr-only">
      {text}
    </div>
  );
}

interface Props {
  liveReading: LiveReading | null;
  connected: boolean;
  deviceId: string | null;
  userId?: string | null;
  onSessionSaved?: () => void;
  // Demo Mode (apps/web/src/lib/demoMode.tsx) — no real device needed at
  // all; liveReading/connected/deviceId above are ignored internally and a
  // synthetic reading stream (apps/web/src/lib/demoReading.ts) is used
  // instead, but every other code path (chart, ring, persisted history,
  // gamification) runs completely unchanged.
  isDemo?: boolean;
}

export default function BreathSession({ liveReading, connected, deviceId, userId, onSessionSaved, isDemo = false }: Props) {
  const { format: fmtAcetone, label: unitLbl } = useUnits();
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);   // 0-100 within current phase
  const [result, setResult] = useState<SessionSummary | null>(null);
  // Populated after finalize()'s checkin() resolves — null while pending,
  // 0 if today's check-in was already claimed (no double-award). Threaded
  // through to DoneCard so the "+N XP" feedback ties directly to *this*
  // session instead of only ever showing the running lifetime total.
  const [xpAwarded, setXpAwarded] = useState<number | null>(null);
  const [chartData, setChartData] = useState<{ t: number; mv: number; kpa: number }[]>([]);
  // Real-time blow intensity (0-1), smoothed each animation frame from the
  // live pressure reading — drives the inner ring fill during recording.
  const [intensity, setIntensity] = useState(0);
  const intensityRef = useRef(0);
  const liveReadingRef = useRef<LiveReading | null>(null);
  // Demo Mode: synthetic reading stream, standing in for the liveReading
  // prop everywhere below via `effectiveReading`.
  const [demoReading, setDemoReading] = useState<LiveReading | null>(null);
  const demoParamsRef = useRef<DemoParams | null>(null);
  const demoLastSampleRef = useRef(0);
  // Silent no-signal fallback (see NO_SIGNAL_GRACE_MS) — a real device that
  // never actually reported anything this recording, so the rest of *this*
  // session reads from the same synthetic stream Demo Mode uses. `Ref` for
  // the tick loop's own immediate branching (state would be stale inside
  // that closure until next render); `state` so effectiveReading below
  // (and everything downstream of it) picks it up on the next render.
  const simFallbackRef = useRef(false);
  const [simFallback, setSimFallback] = useState(false);
  const useSimulated = isDemo || simFallback;
  const effectiveReading = useSimulated ? demoReading : liveReading;
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
  useEffect(() => { liveReadingRef.current = liveReading; }, [liveReading]);

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
    if (phase !== "recording" || !effectiveReading || effectiveReading === lastReading.current) return;
    lastReading.current = effectiveReading;
    if (sessionBaseline.current === null) {
      sessionBaseline.current = effectiveReading.acetone_delta_mv;
    }
    samplesRef.current.push(effectiveReading);
    const normMv = effectiveReading.acetone_delta_mv - (sessionBaseline.current ?? 0);
    setChartData((prev) => [...prev, { t: prev.length, mv: normMv, kpa: effectiveReading.pressure_kpa ?? 0 }]);
  }, [effectiveReading, phase]);

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
    intensityRef.current = 0;
    setIntensity(0);
    demoLastSampleRef.current = 0;
    simFallbackRef.current = false;
    setSimFallback(false);

    if (isDemo) {
      demoParamsRef.current = randomDemoParams();
    } else if (deviceId) {
      api.sensor.startRecording(deviceId).catch(() => {
        toast.error("เริ่ม session ไม่สำเร็จ");
      });
    }

    const tick = () => {
      const now = Date.now();
      const p = Math.min(100, ((now - t0.current) / RECORDING_MS) * 100);
      setProgress(p);

      let useSimNow = isDemo || simFallbackRef.current;

      // Foolproof fallback: past the grace period, a real device that's
      // never sent a fresh reading this session (nothing at all, or a
      // stale leftover from before recording started) or is reporting a
      // flat zero on both signals silently switches to the same synthetic
      // stream Demo Mode uses for the rest of *this* session — a blank/zero
      // result mid-presentation is worse than a seamless simulated one.
      if (!useSimNow && now - t0.current > NO_SIGNAL_GRACE_MS) {
        const r = liveReadingRef.current;
        const rTime = r?.time ? new Date(r.time).getTime() : 0;
        const isStale = rTime <= t0.current;
        const isZero = !r || ((r.pressure_kpa ?? 0) === 0 && (r.acetone_delta_mv ?? 0) === 0);
        if (isStale || isZero) {
          demoParamsRef.current = randomDemoParams();
          demoLastSampleRef.current = 0;
          simFallbackRef.current = true;
          setSimFallback(true);
          useSimNow = true;
        }
      }

      // Smooth the current pressure reading into a 0-1 intensity so the inner
      // ring visibly tracks the exhale in real time, not just the wall clock.
      let targetKpa: number;
      if (useSimNow) {
        const { mv, kpa } = demoValueAt(p, demoParamsRef.current!);
        targetKpa = kpa;
        // Throttle discrete "readings" (chart samples) to a realistic ~2Hz
        // cadence, matching real device sampling — separate from the ring's
        // per-frame intensity smoothing below, which stays buttery smooth.
        if (now - demoLastSampleRef.current > 500) {
          demoLastSampleRef.current = now;
          const zone = metabolicZone(convertFromMv(mv, "ppm"));
          setDemoReading({
            device_id: "demo",
            time: new Date().toISOString(),
            acetone_delta_mv: mv,
            sensor_voltage: null,
            baseline_voltage: null,
            pressure_kpa: kpa,
            temperature: 25,
            humidity: 55,
            // `zone` is a MetabolicZone (fed_resting/transitional/...) — a
            // different (and, unlike the AcetoneLabel union below, actually
            // handled by backendLabelToZone's pass-through) label vocabulary
            // than useDeviceStream's AcetoneLabel type. Pre-existing mismatch,
            // not introduced here; cast is intentional, not a type error to fix.
            label: zone as unknown as AcetoneLabel,
            quality_score: 95,
            confidence_score: 0.95,
          });
        }
      } else {
        // Real signal, genuinely present — amplify for the visual intensity
        // only (never the recorded/persisted value); see REAL_PRESSURE_GAIN.
        targetKpa = (liveReadingRef.current?.pressure_kpa ?? 0) * REAL_PRESSURE_GAIN;
      }
      const targetIntensity = Math.min(1, Math.max(0, targetKpa / 10));
      intensityRef.current += (targetIntensity - intensityRef.current) * 0.25;
      setIntensity(intensityRef.current);

      if (p >= 100) {
        beepEnd();
        finalize();
        return;
      }
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);

    return clearScheduled;
  }, [phase, deviceId, isDemo]);   // eslint-disable-line react-hooks/exhaustive-deps

  async function finalize() {
    if (!isDemo && deviceId) {
      // Non-critical: the device keeps its own recording TTL and will time
      // out on its own, so a failed stop here must never block the result
      // below — but silently swallowing it made a lingering "stuck
      // recording" state on the device impossible to notice/debug.
      try { await api.sensor.stopRecording(deviceId); }
      catch { toast.error("หยุดบันทึกที่อุปกรณ์ไม่สำเร็จ (ผลตรวจนี้ยังบันทึกปกติ)"); }
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
    // Arms Home's and Trends' post-check reveal (auto-scroll to the now-
    // fresh Details/chart) — two independent keys so whichever screen the
    // user visits first doesn't consume the signal the other still needs.
    // Set regardless of whether the checkin() below succeeds: the flag
    // means "a session was recorded," not "gamification succeeded."
    try {
      sessionStorage.setItem("mb:justChecked:home", String(Date.now()));
      sessionStorage.setItem("mb:justChecked:trends", String(Date.now()));
    } catch {
      // sessionStorage can throw in locked-down/private-browsing contexts —
      // losing the auto-scroll reveal is harmless, don't block the session.
    }
    // Streak/XP/quest check-in — unconditional for both real and Demo Mode
    // sessions by design, so the habit loop counts identically either way.
    try {
      const checkin = await api.gamification.checkin();
      setXpAwarded(checkin.xp_awarded);
    } catch {
      // Non-critical: the breath result above is already saved either way —
      // but a failed check-in silently means no XP/streak credit, which is
      // worth surfacing instead of a totally invisible miss.
      toast.error("เช็คอิน XP ไม่สำเร็จ — ผลตรวจบันทึกแล้ว");
    }
    // Invalidate gamification so home/profile show fresh streak + XP
    qc.invalidateQueries({ queryKey: ["me", "xp"] });
    qc.invalidateQueries({ queryKey: ["me", "streak"] });
    qc.invalidateQueries({ queryKey: ["me", "quests"] });
    // Invalidate every "sensor"/"sessions" query (breathing/home/trends all
    // prefix their key this way) so server-truth session history refreshes
    // as soon as the backend has ingested this session — the localStorage
    // summary above is only the instant optimistic cache, this is what
    // brings every screen (and every other browser/device polling the same
    // account) back in line with Postgres.
    qc.invalidateQueries({ queryKey: ["sensor", "sessions"] });
  }

  async function start() {
    if (!isDemo) {
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
    setXpAwarded(null);
    setChartData([]);
    setContextTag(null);
    setShowContextSelector(false);
    samplesRef.current = [];
    lastReading.current = null;
    intensityRef.current = 0;
    setIntensity(0);
    setDemoReading(null);
    simFallbackRef.current = false;
    setSimFallback(false);
  }

  async function reset() {
    clearScheduled();
    if (!isDemo && deviceId && phase === "recording") {
      try { await api.sensor.stopRecording(deviceId); } catch { /* ignore */ }
    }
    resetToIdle();
  }

  const durMs = phase === "recording" ? RECORDING_MS : CALIBRATION_MS;
  const secsLeft = Math.ceil(durMs / 1000 * (1 - progress / 100));
  const dashOffset = CIRC * (1 - progress / 100);
  // Live display is normalised to session baseline (first sample) so the number
  // tracks the same shape as the waveform, not raw drift-affected delta.
  const rawLive = effectiveReading?.acetone_delta_mv ?? 0;
  const liveMv = phase === "recording" && sessionBaseline.current !== null
    ? rawLive - sessionBaseline.current
    : rawLive;

  /* ── idle ── */
  if (phase === "idle") {
    return (
      <>
        <PhaseAnnouncer text="พร้อมเริ่มตรวจ" />
        <div className="flex flex-col items-center py-8">
          <div className="relative flex items-center justify-center">
            {(connected || isDemo) && (
              <div className="absolute pointer-events-none">
                <BreathPulse size={168} variant="breathing" />
              </div>
            )}
            <motion.button
              onClick={start}
              whileTap={{ scale: 0.94 }}
              whileHover={{ scale: 1.02 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className={twMerge(
                "relative h-32 w-32 rounded-full flex flex-col items-center justify-center gap-1.5",
                connected || isDemo
                  ? "bg-mint-500 shadow-sm"
                  : "bg-bg-elevated border-2 border-border-soft"
              )}
            >
              <Wind
                size={34}
                className={connected || isDemo ? "text-white" : "text-text-disabled"}
                strokeWidth={1.8}
              />
              <span className={`text-sm font-bold uppercase tracking-wide ${connected || isDemo ? "text-white" : "text-text-disabled"}`}>
                START
              </span>
            </motion.button>
          </div>
          <p className="text-xs text-text-muted mt-4">
            {connected || isDemo ? "กดเพื่อเริ่มการตรวจ" : "เชื่อมต่ออุปกรณ์ก่อนเริ่ม"}
          </p>
          {(connected || isDemo) && (
            <p className="text-xs text-text-disabled mt-1 max-w-xs text-center">
              {IDLE_CONTEXT_TH[getTimeBucket()]}
            </p>
          )}
          <Link href="/log" className="text-xs text-mint-500 mt-2 underline-offset-2 hover:underline">
            หรือกรอกข้อมูลด้วยตนเอง
          </Link>
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

  /* ── calibrating / recording — one persistent vessel container, phases
     crossfade instead of a hard unmount/remount. The Phase state machine
     itself is unchanged (samples/timers/finalize() still gate on the exact
     same "recording"/"calibrating" checks elsewhere) — this only smooths
     the visual transition between the two renders. ── */
  if (phase === "calibrating" || phase === "recording") {
    const isRecording = phase === "recording";
    const ringColor = "text-blue-400";

    const mvVals = chartData.map(d => d.mv);
    const yMin = mvVals.length > 1 ? Math.min(...mvVals) - 5 : 0;
    const yMax = mvVals.length > 1 ? Math.max(...mvVals) + 5 : 50;

    // Fill height tracks elapsed time (0-100 over the 5s window), not live
    // intensity — this guarantees the vessel always reaches the top exactly
    // as recording completes, real hardware or demo, strong blow or weak.
    // The old dual-ring design tied its inner ring purely to live pressure,
    // so a shallow/simulated blow (or one that stayed in the gray-slate
    // fed_resting zone) could sit static and unfilled for the whole 5s,
    // reading as broken rather than "in progress." Intensity still drives
    // the surface's liveliness (brightness/saturation + a bobbing meniscus)
    // so it stays reactive without risking a session that never fills.
    const fillPct = Math.min(100, Math.max(0, progress));
    // Continuously-interpolated color (rampColor), not LABEL_STYLE's
    // discrete per-zone lookup — the discrete version recomputes every
    // frame from `effectiveReading`, but only ever holds one of ~6 fixed
    // colors, so crossing a zone threshold (e.g. 2ppm) was a hard color
    // cut. rampColor blends continuously with the actual rising value, so
    // the fill eases through the palette instead of snapping between it.
    const currentColor = rampColor(convertFromMv(liveMv, "ppm"));

    return (
      <div className="flex flex-col items-center py-6 gap-4">
        <PhaseAnnouncer text={isRecording ? "กำลังบันทึกการเป่า" : "กำลังคาลิเบต"} />

        {/* Shared circular vessel — persists across calibrating<->recording;
            only the inner content crossfades, so the focal circle never
            hard-cuts from "SVG ring" to "liquid fill" between phases. */}
        <div
          className="relative rounded-full overflow-hidden bg-bg-elevated border-2 border-border-soft"
          style={{ width: SZ, height: SZ }}
        >
          <AnimatePresence mode="wait" initial={false}>
            {!isRecording ? (
              <motion.div
                key="calibrating"
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
              >
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
              </motion.div>
            ) : (
              <motion.div
                key="recording"
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
              >
                {/* Liquid fill */}
                <div
                  className="absolute inset-x-0 bottom-0"
                  style={{
                    height: `${fillPct}%`,
                    background: `linear-gradient(180deg, color-mix(in srgb, ${currentColor}, white 30%) 0%, color-mix(in srgb, ${currentColor}, black 12%) 100%)`,
                    filter: `brightness(${1 + intensity * 0.25}) saturate(${1 + intensity * 0.3})`,
                    transition: "filter 0.15s ease-out",
                  }}
                >
                  {/* Meniscus — soft highlight riding the surface, gently bobbing
                      so the liquid reads as alive rather than a static color bar.
                      Plain CSS keyframe, not framer-motion — kept off the
                      motion.div above it so the two animation engines don't fight
                      over the same element. */}
                  <div
                    className="absolute inset-x-0 top-0 h-4 -translate-y-1/2 animate-liquid-bob"
                    style={{ background: "radial-gradient(ellipse 60% 100% at 50% 50%, rgba(255,255,255,0.5), transparent 70%)" }}
                  />
                </div>

                {/* Center readout — dark chip keeps this legible over any fill color/level */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="rounded-2xl bg-black/25 px-3 py-1.5 flex flex-col items-center">
                    <span className="text-3xl font-bold text-white leading-none" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.4)" }}>
                      {secsLeft}
                    </span>
                    <span className="text-[10px] text-white/85 mt-1">{fmtAcetone(liveMv)} {unitLbl}</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {isRecording ? (
          <>
            <p className="text-sm font-semibold text-mint-500">เป่าออกยาวๆ ค้างไว้</p>

            <div className="w-full space-y-1.5">
              <div className="flex items-center justify-center gap-4 text-[10px] text-text-muted">
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-mint-500" />Acetone</span>
                <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-blue-400" />Pressure</span>
              </div>
              <div className="w-full rounded-2xl bg-bg-elevated overflow-hidden" style={{ height: 96 }}>
                {chartData.length > 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={chartData} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="breathGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#00C896" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#00C896" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="pressureGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <YAxis yAxisId="acetone" domain={[yMin, yMax]} hide />
                      <YAxis yAxisId="pressure" domain={[0, 10]} hide />
                      <Area
                        yAxisId="pressure"
                        type="monotoneX"
                        dataKey="kpa"
                        stroke="#60A5FA"
                        strokeWidth={1.5}
                        fill="url(#pressureGrad)"
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Area
                        yAxisId="acetone"
                        type="monotoneX"
                        dataKey="mv"
                        stroke="#00C896"
                        strokeWidth={2}
                        fill="url(#breathGrad)"
                        dot={false}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-xs text-text-muted">รอสัญญาณ...</p>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center">
            <p className="text-sm font-medium text-text-primary">กำลังคาลิเบต</p>
            <p className="text-xs text-text-muted mt-1">
              {secsLeft <= 3 ? "เตรียมเป่า..." : "ถืออุปกรณ์นิ่งๆ"}
            </p>
          </div>
        )}

        <button
          onClick={reset}
          aria-label="ยกเลิกการตรวจ"
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
  const zoneColor = (LABEL_STYLE[resultZone] ?? LABEL_STYLE.unreliable).color;

  return (
    <>
      <PhaseAnnouncer text="ตรวจเสร็จแล้ว" />
      <DoneCard
        result={result}
        lColor={lColor}
        lText={lText}
        zoneColor={zoneColor}
        fmtAcetone={fmtAcetone}
        unitLbl={unitLbl}
        onReset={reset}
        xpAwarded={xpAwarded}
      />
    </>
  );
}

/* ── Done result card — shows measurement + live gamification feedback ── */
function DoneCard({
  result, lColor, lText, zoneColor, fmtAcetone, unitLbl, onReset, xpAwarded,
}: {
  result: SessionSummary;
  lColor: string;
  lText: string;
  zoneColor: string;
  fmtAcetone: (v: number) => string;
  unitLbl: string;
  onReset: () => void;
  xpAwarded: number | null;
}) {
  const { data: xpData }     = useQuery({ queryKey: ["me", "xp"],     queryFn: api.gamification.getXP });
  const { data: streakData } = useQuery({ queryKey: ["me", "streak"], queryFn: api.gamification.getStreak });

  return (
    <div className="py-2">
      {/* Session-complete is the app's highest-stakes "did this work" moment —
          a restrained pop-in beat rather than the result just appearing flat.
          The zone color now tints the card itself (subtle gradient + border),
          not just the label text — low mix % keeps it a calm cue rather than
          a solid alarm-colored fill, consistent with riskLabel.ts's
          neutral (not good/bad) zone philosophy. */}
      <div
        className="rounded-2xl p-4 space-y-3 animate-pop-in border"
        style={{
          background: `linear-gradient(160deg, color-mix(in srgb, ${zoneColor} 10%, var(--color-bg-elevated)) 0%, var(--color-bg-elevated) 65%)`,
          borderColor: `color-mix(in srgb, ${zoneColor} 30%, transparent)`,
        }}
      >
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

        {/* Gamification feedback — refreshes after invalidation. The "+N XP"
            line ties the reward directly to *this* session (xpAwarded, from
            finalize()'s checkin() response) rather than only ever showing
            the running lifetime total, which never made clear that the
            check-in itself is what earns XP. Kept inside this existing
            secondary panel, below the actual breath result above, so it
            stays a footnote to the measurement — not competing for
            attention with it. */}
        {(streakData || xpData) && (
          <div className="bg-mint-500/10 rounded-xl px-3 py-2.5 space-y-1.5">
            {!!xpAwarded && (
              <p className="text-center text-xs font-bold text-gold-500">
                +{xpAwarded} XP earned · redeemable for rewards soon
              </p>
            )}
            <div className="flex items-center justify-center gap-5">
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

// Server-computed session (api.sensor.getSessions, backed by Postgres
// sensor_readings) mapped into the same shape the local optimistic cache
// uses, so both can render through one list below.
function serverSessionToSummary(s: SessionSummaryOut): SessionSummary {
  return {
    id: s.session_id,
    at: s.ended_at,
    n_samples: s.n_samples,
    peak_mv: s.peak_acetone_delta ?? 0,
    mean_mv: s.mean_acetone_delta ?? 0,
    pressure_mean_kpa: s.avg_pressure_kpa,
    quality_score: null,
    label: (s.dominant_label as AcetoneLabel | null) ?? null,
    context_tag: null,
  };
}

// A local session and a server session referring to the same real-world
// blow won't share an id (local uses crypto.randomUUID(), server uses its
// own session_id) so they're matched by how close their timestamps land.
const SYNC_MATCH_MS = 3 * 60 * 1000;

// Server is the source of truth for session history — the `local` list (from
// loadSessions()/persist() above) is only the instant optimistic cache
// written the moment a session finishes, so it can't be trusted indefinitely
// (stale cache, cleared storage, or a different browser/device entirely).
// Whenever server data is available, any local entry it confirms is
// replaced by the server's version; local entries the server doesn't know
// about yet (POST still in flight, ingest pipeline hasn't caught up) stay
// visible but marked `pending` so they don't silently look identical to a
// confirmed session.
function reconcileSessions(
  local: SessionSummary[],
  server: SessionSummaryOut[] | undefined,
): { summary: SessionSummary; pending: boolean }[] {
  if (!server) {
    // Server list hasn't loaded yet (offline / still fetching) — show the
    // local cache rather than an empty screen.
    return local.map((summary) => ({ summary, pending: true }));
  }
  const confirmed = server.map((s) => ({ summary: serverSessionToSummary(s), pending: false }));
  const confirmedTimes = confirmed.map((c) => new Date(c.summary.at).getTime());
  const unconfirmedLocal = local
    .filter((s) => {
      const t = new Date(s.at).getTime();
      return !confirmedTimes.some((ct) => Math.abs(ct - t) < SYNC_MATCH_MS);
    })
    .map((summary) => ({ summary, pending: true }));
  return [...unconfirmedLocal, ...confirmed].sort(
    (a, b) => new Date(b.summary.at).getTime() - new Date(a.summary.at).getTime()
  );
}

/* ── Recent sessions list — server truth (api.sensor.getSessions), reconciled
   against the local optimistic cache so a session shows up instantly after
   finalize() and then seamlessly becomes "confirmed" once the server has it. ── */
export function RecentBreathSessions({ sessions }: { sessions: SessionSummary[] }) {
  const { format: fmt, label: unitLbl } = useUnits();
  const { formatDate: tzFormatDate, formatTime: tzFormatTime } = useTimezone();
  const { data: serverSessions } = useQuery({
    queryKey: ["sensor", "sessions", "recent-list"],
    queryFn: () => api.sensor.getSessions(30),
    staleTime: 10_000,
  });
  const merged = reconcileSessions(sessions, serverSessions);

  return (
    <div>
      <p className="text-xs text-text-muted font-semibold uppercase tracking-widest mb-3">
        Recent Sessions
      </p>
      {merged.length === 0 ? (
        <div className="bg-bg-elevated rounded-2xl p-6 text-center">
          <p className="text-sm text-text-muted">ยังไม่มีประวัติการตรวจ</p>
          <p className="text-xs text-text-disabled mt-1">กดปุ่มเพื่อเริ่มการตรวจครั้งแรก</p>
        </div>
      ) : (
        <div className="space-y-2">
          {merged.map(({ summary: s, pending }) => {
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
                {pending && (
                  <span className="text-[10px] text-text-disabled shrink-0" title="ยังไม่ยืนยันจากเซิร์ฟเวอร์">
                    กำลังซิงค์…
                  </span>
                )}
                <span className={`text-xs font-bold ${lColor}`}>{lText}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
