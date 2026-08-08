"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  api,
  AdminUserOut,
  AdminDeviceOut,
  AdminReadingOut,
  AdminReadingSummary,
  DoctorOut,
} from "@/lib/api";
import AdminAgreementPanel from "@/components/AdminAgreementPanel";
import { useAuth } from "@/lib/auth";

// ─── Label styling ────────────────────────────────────────────────────────────

const LABEL_META: Record<string, { color: string; bg: string; dot: string; th: string }> = {
  normal:    { color: "text-emerald-700", bg: "bg-emerald-50",  dot: "bg-emerald-400",  th: "ปกติ" },
  elevated:  { color: "text-amber-700",   bg: "bg-amber-50",    dot: "bg-amber-400",    th: "สูงขึ้น" },
  high:      { color: "text-orange-700",  bg: "bg-orange-50",   dot: "bg-orange-500",   th: "สูง" },
  very_high: { color: "text-red-700",     bg: "bg-red-50",      dot: "bg-red-500",      th: "สูงมาก" },
};

function LabelBadge({ label }: { label: string | null }) {
  if (!label) return <span className="text-xs text-gray-300">—</span>;
  const m = LABEL_META[label] ?? { color: "text-gray-600", bg: "bg-gray-50", dot: "bg-gray-400", th: label };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${m.bg} ${m.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.th}
    </span>
  );
}

function QualityBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-gray-300">—</span>;
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 80 ? "bg-emerald-400" : pct >= 50 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden w-16">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{pct.toFixed(0)}</span>
    </div>
  );
}

// ─── Password Gate ────────────────────────────────────────────────────────────

function PasswordGate({ onUnlock }: { onUnlock: (pw: string) => void }) {
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw.trim()) return;
    setLoading(true);
    setErr("");
    try {
      await api.admin.verify(pw);
      sessionStorage.setItem("admin_password", pw);
      onUnlock(pw);
    } catch {
      setErr("รหัสผ่านไม่ถูกต้อง");
      setPw("");
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Icon */}
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white/10 backdrop-blur border border-white/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white tracking-tight">Admin Console</h1>
          <p className="text-slate-400 text-sm mt-1">MetaBreath · Cheewarun</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="password"
              value={pw}
              onChange={(e) => { setPw(e.target.value); setErr(""); }}
              placeholder="Admin password"
              className="w-full bg-white/10 border border-white/20 text-white placeholder-slate-500 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 focus:border-white/40 transition"
            />
          </div>

          {err && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2.5 text-red-400 text-sm">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !pw}
            className="w-full bg-white text-slate-900 font-semibold rounded-xl py-3.5 text-sm hover:bg-slate-100 disabled:opacity-40 transition-all"
          >
            {loading ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ Admin"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── User Card ────────────────────────────────────────────────────────────────

function UserCard({
  user,
  onSelect,
  onOpen,
  selected,
}: {
  user: AdminUserOut;
  onSelect: () => void;
  onOpen: () => void;
  selected: boolean;
}) {
  const s: AdminReadingSummary = user.reading_summary;
  const hasReadings = s.total_readings > 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className={`w-full text-left rounded-2xl border transition-all duration-200 overflow-hidden cursor-pointer ${
        selected
          ? "border-slate-700 bg-slate-900 shadow-lg ring-1 ring-slate-700"
          : "border-gray-100 bg-white hover:border-slate-300 hover:shadow-md"
      }`}
    >
      {/* Header */}
      <div className={`px-5 py-4 flex items-center gap-3 ${selected ? "border-b border-slate-700" : "border-b border-gray-50"}`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
          selected ? "bg-white/10 text-white" : "bg-slate-100 text-slate-600"
        }`}>
          {(user.display_name || user.username)[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`font-semibold text-sm truncate ${selected ? "text-white" : "text-gray-900"}`}>
            {user.display_name || user.username}
          </div>
          <div className={`text-xs truncate mt-0.5 ${selected ? "text-slate-400" : "text-gray-400"}`}>
            {user.email}
          </div>
        </div>
        <div className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${
          user.devices.length > 0
            ? selected ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-50 text-emerald-600"
            : selected ? "bg-white/10 text-slate-400" : "bg-gray-50 text-gray-400"
        }`}>
          {user.devices.length} device{user.devices.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Reading summary */}
      <div className={`px-5 py-3 grid grid-cols-3 gap-3 ${selected ? "bg-slate-800/50" : "bg-gray-50/50"}`}>
        <div>
          <div className={`text-xs mb-1 ${selected ? "text-slate-500" : "text-gray-400"}`}>บันทึกทั้งหมด</div>
          <div className={`text-lg font-bold ${selected ? "text-white" : "text-gray-900"}`}>
            {s.total_readings}
          </div>
        </div>
        <div>
          <div className={`text-xs mb-1 ${selected ? "text-slate-500" : "text-gray-400"}`}>ผลล่าสุด</div>
          <LabelBadge label={hasReadings ? s.last_label : null} />
        </div>
        <div>
          <div className={`text-xs mb-1 ${selected ? "text-slate-500" : "text-gray-400"}`}>Acetone Δ</div>
          <div className={`text-sm font-semibold ${selected ? "text-slate-200" : "text-gray-700"}`}>
            {hasReadings && s.last_acetone_delta !== null ? `${s.last_acetone_delta.toFixed(2)} ppm` : "—"}
          </div>
        </div>
      </div>

      {/* Footer — last reading time + action bar */}
      <div className={`px-5 py-2.5 flex items-center justify-between text-xs gap-3 ${
        selected ? "border-t border-slate-700/50" : "border-t border-gray-100"
      }`}>
        <span className={selected ? "text-slate-500" : "text-gray-400"}>
          {hasReadings && s.last_reading_at
            ? new Date(s.last_reading_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
            : "ยังไม่มีบันทึก"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition ${
              selected
                ? "bg-white/10 text-white hover:bg-white/20"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            + กรอกข้อมูล
          </button>
          <span className={`inline-flex items-center gap-1 font-medium ${selected ? "text-slate-300" : "text-slate-700"}`}>
            ดูแดชบอร์ด
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
            </svg>
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Input Form ───────────────────────────────────────────────────────────────

function NumInput({
  label, unit, value, onChange,
}: {
  label: string; unit?: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-500">
        {label}{unit && <span className="text-gray-400 font-normal"> · {unit}</span>}
      </label>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300 transition bg-white"
      />
    </div>
  );
}

// ─── Reading Entry Panel ──────────────────────────────────────────────────────

function EntryPanel({
  user,
  onDone,
}: {
  user: AdminUserOut;
  onDone: (updated: AdminUserOut) => void;
}) {
  const [devices, setDevices] = useState<AdminDeviceOut[]>(user.devices);
  const [selectedDevice, setSelectedDevice] = useState<AdminDeviceOut | null>(
    user.devices[0] ?? null
  );
  const [ensureLoading, setEnsureLoading] = useState(false);

  const [form, setForm] = useState({
    ambient_voc: "", breath_voc: "", pressure_mean: "", pressure_std: "",
    breath_duration: "", temp_c: "", humidity_pct: "", note: "", time: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AdminReadingOut | null>(null);
  const [error, setError] = useState("");

  function setF(k: string, v: string) { setForm((f) => ({ ...f, [k]: v })); setError(""); setResult(null); }

  async function handleEnsure() {
    setEnsureLoading(true);
    try {
      const dev = await api.admin.ensureManualDevice(user.id);
      const next = devices.find((d) => d.id === dev.id) ? devices : [...devices, dev];
      setDevices(next);
      setSelectedDevice(dev);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setEnsureLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDevice) return;
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const out = await api.admin.submitReading({
        device_id: selectedDevice.id,
        ambient_voc: form.ambient_voc ? parseFloat(form.ambient_voc) : undefined,
        breath_voc: form.breath_voc ? parseFloat(form.breath_voc) : undefined,
        pressure_mean: form.pressure_mean ? parseFloat(form.pressure_mean) : undefined,
        pressure_std: form.pressure_std ? parseFloat(form.pressure_std) : undefined,
        breath_duration: form.breath_duration ? parseFloat(form.breath_duration) : undefined,
        temp_c: form.temp_c ? parseFloat(form.temp_c) : undefined,
        humidity_pct: form.humidity_pct ? parseFloat(form.humidity_pct) : undefined,
        note: form.note || undefined,
        time: form.time ? new Date(form.time).toISOString() : undefined,
      });
      setResult(out);
      setForm((f) => ({ ...f, note: "" }));
      onDone({
        ...user,
        devices,
        reading_summary: {
          total_readings: user.reading_summary.total_readings + 1,
          last_reading_at: out.time,
          last_label: out.label,
          last_acetone_delta: out.acetone_delta,
          last_quality_score: out.quality_score,
        },
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Device picker */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">อุปกรณ์</div>
        {devices.length === 0 ? (
          <button
            onClick={handleEnsure}
            disabled={ensureLoading}
            className="w-full border-2 border-dashed border-gray-200 rounded-xl py-3 text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 transition disabled:opacity-50"
          >
            {ensureLoading ? "กำลังสร้าง..." : "+ สร้าง Virtual Device สำหรับ Manual Entry"}
          </button>
        ) : (
          <div className="flex flex-wrap gap-2">
            {devices.map((d) => (
              <button
                key={d.id}
                onClick={() => setSelectedDevice(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono border transition ${
                  selectedDevice?.id === d.id
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                }`}
              >
                {d.kind === "manual" ? "Manual" : d.sensor_model ?? d.kind} · {d.id.slice(0, 8)}
              </button>
            ))}
            <button
              onClick={handleEnsure}
              disabled={ensureLoading}
              className="px-3 py-1.5 rounded-lg text-xs border border-dashed border-gray-200 text-gray-400 hover:text-gray-500 transition disabled:opacity-50"
            >
              + Virtual
            </button>
          </div>
        )}
      </div>

      {selectedDevice && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Sensor fields */}
          <div className="bg-gray-50 rounded-2xl p-4 grid grid-cols-2 gap-3">
            <NumInput label="Ambient VOC" unit="ppm" value={form.ambient_voc} onChange={(v) => setF("ambient_voc", v)} />
            <NumInput label="Breath VOC" unit="ppm" value={form.breath_voc} onChange={(v) => setF("breath_voc", v)} />
            <NumInput label="Pressure Mean" unit="hPa" value={form.pressure_mean} onChange={(v) => setF("pressure_mean", v)} />
            <NumInput label="Pressure Std" unit="hPa" value={form.pressure_std} onChange={(v) => setF("pressure_std", v)} />
            <NumInput label="Breath Duration" unit="s" value={form.breath_duration} onChange={(v) => setF("breath_duration", v)} />
            <NumInput label="Temperature" unit="°C" value={form.temp_c} onChange={(v) => setF("temp_c", v)} />
            <NumInput label="Humidity" unit="%" value={form.humidity_pct} onChange={(v) => setF("humidity_pct", v)} />
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-500">เวลา <span className="text-gray-400 font-normal">(ปล่อยว่าง = ตอนนี้)</span></label>
              <input
                type="datetime-local"
                value={form.time}
                onChange={(e) => setF("time", e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 transition bg-white"
              />
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-500">หมายเหตุ <span className="text-gray-400 font-normal">(audit trail)</span></label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setF("note", e.target.value)}
              placeholder="เช่น pilot day 3, fasting 16h"
              className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 transition"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-600 text-sm">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-all text-sm"
          >
            {submitting ? "กำลังประมวลผล..." : "บันทึกเข้า Database"}
          </button>
        </form>
      )}

      {/* Result card */}
      {result && (
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-emerald-800">บันทึกสำเร็จ</span>
            <LabelBadge label={result.label} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl p-3 space-y-1">
              <div className="text-xs text-gray-400">Acetone Delta</div>
              <div className="text-xl font-bold text-gray-900">{result.acetone_delta?.toFixed(3) ?? "—"}</div>
              <div className="text-xs text-gray-400">ppm</div>
            </div>
            <div className="bg-white rounded-xl p-3 space-y-1">
              <div className="text-xs text-gray-400">Risk Index</div>
              <div className="text-xl font-bold text-gray-900">{result.metabolic_risk_index ?? "—"}</div>
              <div className="text-xs text-gray-400">/ 10</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-400 mb-1.5">Quality Score</div>
              <QualityBar score={result.quality_score} />
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1.5">Confidence</div>
              <QualityBar score={result.confidence_score !== null ? result.confidence_score! * 100 : null} />
            </div>
          </div>

          <div className="text-xs text-emerald-600 text-right">
            {new Date(result.time).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Actions Panel (delete / doctor assignment) ────────────────────────────────

function ActionsPanel({
  user,
  doctors,
  onDeleted,
  onUpdated,
}: {
  user: AdminUserOut;
  doctors: DoctorOut[];
  onDeleted: () => void;
  onUpdated: (updated: AdminUserOut) => void;
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setBusy(true);
    setError("");
    try {
      await api.admin.deleteUser(user.id);
      onDeleted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  async function handleAssignDoctor(doctorId: string) {
    setBusy(true);
    setError("");
    try {
      await api.admin.assignDoctor(user.id, doctorId || null);
      onUpdated({ ...user, assigned_doctor_id: doctorId || null });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  async function handleMakeDoctor() {
    setBusy(true);
    setError("");
    try {
      await api.admin.setRole(user.id, "doctor");
      onUpdated({ ...user, role: "doctor" });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">บทบาท</div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700 capitalize">{user.role}</span>
          {user.role === "patient" && (
            <button
              onClick={handleMakeDoctor}
              disabled={busy}
              className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 transition disabled:opacity-50"
            >
              ตั้งเป็นแพทย์
            </button>
          )}
        </div>
      </div>

      {user.role === "patient" && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">แพทย์ผู้ดูแล</div>
          <select
            value={user.assigned_doctor_id ?? ""}
            onChange={(e) => handleAssignDoctor(e.target.value)}
            disabled={busy}
            className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300 transition bg-white disabled:opacity-50"
          >
            <option value="">ยังไม่กำหนด</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.display_name || d.username}</option>
            ))}
          </select>
          {doctors.length === 0 && (
            <div className="text-xs text-gray-400">ยังไม่มีบัญชีแพทย์ — ตั้งผู้ใช้คนใดคนหนึ่งเป็นแพทย์ก่อน</div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-red-600 text-sm">{error}</div>
      )}

      <div className="pt-2 border-t border-gray-100">
        {!confirmingDelete ? (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="text-xs text-red-500 hover:text-red-700 transition px-3 py-2 rounded-lg hover:bg-red-50"
          >
            ลบบัญชีผู้ใช้นี้
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">ยืนยันการลบบัญชี?</span>
            <button
              onClick={handleDelete}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-50"
            >
              {busy ? "กำลังลบ..." : "ยืนยันลบ"}
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:border-gray-300 transition"
            >
              ยกเลิก
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "entry" | "actions";

export default function AdminPage() {
  const router = useRouter();
  const { user: currentUser, loading: authLoading, logout } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  const [users, setUsers] = useState<AdminUserOut[]>([]);
  const [doctors, setDoctors] = useState<DoctorOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserOut | null>(null);
  const [tab, setTab] = useState<Tab>("entry");

  // Role-based admin (e.g. the seeded "admin" account) skips the password gate entirely.
  // NOTE: `is_admin` from /auth/me is broader (also true when email matches ADMIN_EMAIL),
  // but backend admin endpoints require X-Admin-Password for the email path — so legacy
  // email admins must still go through PasswordGate to set the header.
  const isRoleAdmin = currentUser?.role === "admin";

  // Check if already unlocked this session
  useEffect(() => {
    if (authLoading) return;
    if (isRoleAdmin) { setUnlocked(true); return; }
    const stored = sessionStorage.getItem("admin_password");
    if (stored) setUnlocked(true);
  }, [authLoading, isRoleAdmin]);

  useEffect(() => {
    if (!unlocked) return;
    setLoading(true);
    Promise.all([api.admin.listUsers(), api.admin.listDoctors()])
      .then(([u, d]) => { setUsers(u); setDoctors(d); })
      .catch(() => {
        if (!isRoleAdmin) {
          sessionStorage.removeItem("admin_password");
          setUnlocked(false);
        }
      })
      .finally(() => setLoading(false));
  }, [unlocked, isRoleAdmin]);

  function handleUnlock(pw: string) {
    sessionStorage.setItem("admin_password", pw);
    setUnlocked(true);
  }

  function handleUserUpdated(updated: AdminUserOut) {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    setSelectedUser(updated);
    if (updated.role === "doctor" && !doctors.some((d) => d.id === updated.id)) {
      setDoctors((prev) => [...prev, { id: updated.id, username: updated.username, display_name: updated.display_name }]);
    }
  }

  function handleUserDeleted() {
    if (!selectedUser) return;
    setUsers((prev) => prev.filter((u) => u.id !== selectedUser.id));
    setDoctors((prev) => prev.filter((d) => d.id !== selectedUser.id));
    setSelectedUser(null);
  }

  if (!unlocked) return <PasswordGate onUnlock={handleUnlock} />;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-900 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <div>
            <h1 className="font-bold text-gray-900 text-sm leading-none">Admin Console</h1>
            <p className="text-xs text-gray-400 mt-0.5">MetaBreath · Cheewarun</p>
          </div>
        </div>
        <button
          onClick={() => {
            sessionStorage.removeItem("admin_password");
            if (isRoleAdmin) {
              logout();
              window.location.href = "/login";
            } else {
              setUnlocked(false);
            }
          }}
          className="text-xs text-gray-400 hover:text-gray-600 transition px-3 py-1.5 rounded-lg hover:bg-gray-100"
        >
          ออกจากระบบ Admin
        </button>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Stats bar */}
        {!loading && users.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: "ผู้ใช้ทั้งหมด", value: users.length },
              { label: "อุปกรณ์ทั้งหมด", value: users.reduce((s, u) => s + u.devices.length, 0) },
              { label: "บันทึกทั้งหมด", value: users.reduce((s, u) => s + u.reading_summary.total_readings, 0) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white rounded-2xl border border-gray-100 px-5 py-4">
                <div className="text-2xl font-bold text-gray-900">{value}</div>
                <div className="text-xs text-gray-400 mt-1">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Breath ↔ urine ketone agreement */}
        <div className="mb-6">
          <AdminAgreementPanel />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left — user list */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-1">ผู้ใช้</div>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-white rounded-2xl border border-gray-100 h-28 animate-pulse" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {users.map((u) => (
                  <UserCard
                    key={u.id}
                    user={u}
                    selected={selectedUser?.id === u.id}
                    onSelect={() => {
                      setSelectedUser(u.id === selectedUser?.id ? null : u);
                      setTab("entry");
                    }}
                    onOpen={() => router.push(`/admin/user/${u.id}`)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right — entry panel */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            {selectedUser ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="font-semibold text-gray-900">{selectedUser.display_name || selectedUser.username}</div>
                    <div className="text-xs text-gray-400 mt-0.5">{selectedUser.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => router.push(`/admin/user/${selectedUser.id}`)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition"
                    >
                      ดูแดชบอร์ด
                    </button>
                    <button
                      onClick={() => setSelectedUser(null)}
                      className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition text-gray-500"
                      aria-label="ปิด"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex gap-1 mb-5 border-b border-gray-100">
                  {([
                    { id: "entry", label: "กรอกข้อมูล" },
                    { id: "actions", label: "จัดการ" },
                  ] as { id: Tab; label: string }[]).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={`text-xs font-medium px-3 py-2 -mb-px border-b-2 transition ${
                        tab === t.id
                          ? "border-slate-900 text-slate-900"
                          : "border-transparent text-gray-400 hover:text-gray-600"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {tab === "entry" && <EntryPanel user={selectedUser} onDone={handleUserUpdated} />}
                {tab === "actions" && (
                  <ActionsPanel
                    user={selectedUser}
                    doctors={doctors}
                    onDeleted={handleUserDeleted}
                    onUpdated={handleUserUpdated}
                  />
                )}
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M15 19l-7-7 7-7" />
                  </svg>
                </div>
                <div className="text-sm font-medium text-gray-400">เลือกผู้ใช้ทางซ้าย</div>
                <div className="text-xs text-gray-300 mt-1">เพื่อกรอกข้อมูล sensor</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
