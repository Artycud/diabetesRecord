"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Users2, Stethoscope, UserPlus2 } from "lucide-react";
import {
  api,
  AdminUserOut,
  AdminDeviceOut,
  AdminReadingOut,
  AdminReadingSummary,
  DoctorOut,
} from "@/lib/api";
import AdminAgreementPanel from "@/components/AdminAgreementPanel";
import AdminAiFallbackPanel from "@/components/AdminAiFallbackPanel";
import { useAuth } from "@/lib/auth";
import { UserSearchBar } from "@/components/admin/UserSearchBar";
import { UserGroupSection } from "@/components/admin/UserGroupSection";
import { AssignPatientsPanel } from "@/components/admin/AssignPatientsPanel";
import { CreateDoctorSheet } from "@/components/admin/CreateDoctorSheet";

// ─── Label styling ────────────────────────────────────────────────────────────

const LABEL_META: Record<string, { color: string; bg: string; dot: string; th: string }> = {
  normal:    { color: "text-success", bg: "bg-success/10", dot: "bg-success",  th: "ปกติ" },
  elevated:  { color: "text-warning", bg: "bg-warning/10", dot: "bg-warning",  th: "สูงขึ้น" },
  high:      { color: "text-orange-600", bg: "bg-orange-500/10", dot: "bg-orange-500",   th: "สูง" },
  very_high: { color: "text-danger",  bg: "bg-danger/10",  dot: "bg-danger",   th: "สูงมาก" },
};

function LabelBadge({ label }: { label: string | null }) {
  if (!label) return <span className="text-xs text-text-disabled">—</span>;
  const m = LABEL_META[label] ?? { color: "text-text-muted", bg: "bg-bg-elevated", dot: "bg-text-disabled", th: label };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${m.bg} ${m.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.th}
    </span>
  );
}

function QualityBar({ score }: { score: number | null }) {
  if (score === null) return <span className="text-xs text-text-disabled">—</span>;
  const pct = Math.min(100, Math.max(0, score));
  const color = pct >= 80 ? "bg-success" : pct >= 50 ? "bg-warning" : "bg-danger";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-bg-elevated rounded-full overflow-hidden w-16">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-text-muted w-8 text-right">{pct.toFixed(0)}</span>
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
    <div className="min-h-screen bg-bg-primary flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Icon */}
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-mint-500/15 border border-mint-500/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-mint-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Admin Console</h1>
          <p className="text-text-muted text-sm mt-1">MetaBreath</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <input
              ref={inputRef}
              type="password"
              value={pw}
              onChange={(e) => { setPw(e.target.value); setErr(""); }}
              placeholder="Admin password"
              className="w-full bg-bg-surface border border-border-soft text-text-primary placeholder-text-disabled rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-mint-500/30 focus:border-mint-500/40 transition"
            />
          </div>

          {err && (
            <div className="flex items-center gap-2 bg-danger/10 border border-danger/20 rounded-lg px-3 py-2.5 text-danger text-sm">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !pw}
            className="w-full bg-mint-500 text-white font-semibold rounded-xl py-3.5 text-sm hover:bg-mint-600 disabled:opacity-40 transition-all"
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
          ? "border-mint-500/50 bg-bg-elevated shadow-lg ring-1 ring-mint-500/30"
          : "border-border-soft bg-bg-surface hover:border-mint-500/30 hover:shadow-md"
      }`}
    >
      {/* Header */}
      <div className={`px-5 py-4 flex items-center gap-3 border-b ${selected ? "border-mint-500/20" : "border-border-soft/60"}`}>
        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
          selected ? "bg-mint-500/20 text-mint-500" : "bg-bg-elevated text-text-muted"
        }`}>
          {(user.display_name || user.username)[0].toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate text-text-primary">
            {user.display_name || user.username}
          </div>
          <div className="text-xs truncate mt-0.5 text-text-disabled">
            {user.email}
          </div>
        </div>
        <div className={`shrink-0 text-xs px-2 py-1 rounded-full font-medium ${
          user.devices.length > 0 ? "bg-success/10 text-success" : "bg-bg-elevated text-text-disabled"
        }`}>
          {user.devices.length} device{user.devices.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Reading summary */}
      <div className="px-5 py-3 grid grid-cols-3 gap-3 bg-bg-elevated/50">
        <div>
          <div className="text-xs mb-1 text-text-disabled">บันทึกทั้งหมด</div>
          <div className="text-lg font-bold text-text-primary">
            {s.total_readings}
          </div>
        </div>
        <div>
          <div className="text-xs mb-1 text-text-disabled">ผลล่าสุด</div>
          <LabelBadge label={hasReadings ? s.last_label : null} />
        </div>
        <div>
          <div className="text-xs mb-1 text-text-disabled">Acetone Δ</div>
          <div className="text-sm font-semibold text-text-muted">
            {hasReadings && s.last_acetone_delta !== null ? `${s.last_acetone_delta.toFixed(2)} ppm` : "—"}
          </div>
        </div>
      </div>

      {/* Footer — last reading time + action bar */}
      <div className="px-5 py-2.5 flex items-center justify-between text-xs gap-3 border-t border-border-soft">
        <span className="text-text-disabled">
          {hasReadings && s.last_reading_at
            ? new Date(s.last_reading_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })
            : "ยังไม่มีบันทึก"}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            className="px-2.5 py-1 rounded-md text-xs font-medium transition bg-bg-elevated text-text-muted hover:bg-border-soft"
          >
            + กรอกข้อมูล
          </button>
          <span className="inline-flex items-center gap-1 font-medium text-mint-600">
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
      <label className="text-xs font-medium text-text-muted">
        {label}{unit && <span className="text-text-disabled font-normal"> · {unit}</span>}
      </label>
      <input
        type="number"
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="—"
        className="w-full border border-border-soft rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-mint-500/30 focus:border-mint-500/40 transition bg-bg-surface"
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
        <div className="text-xs font-semibold text-text-disabled uppercase tracking-wide mb-2">อุปกรณ์</div>
        {devices.length === 0 ? (
          <button
            onClick={handleEnsure}
            disabled={ensureLoading}
            className="w-full border-2 border-dashed border-border-soft rounded-xl py-3 text-sm text-text-disabled hover:border-mint-500/30 hover:text-text-muted transition disabled:opacity-50"
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
                    ? "bg-mint-500 text-white border-mint-500"
                    : "bg-bg-surface text-text-muted border-border-soft hover:border-mint-500/30"
                }`}
              >
                {d.kind === "manual" ? "Manual" : d.sensor_model ?? d.kind} · {d.id.slice(0, 8)}
              </button>
            ))}
            <button
              onClick={handleEnsure}
              disabled={ensureLoading}
              className="px-3 py-1.5 rounded-lg text-xs border border-dashed border-border-soft text-text-disabled hover:text-text-muted transition disabled:opacity-50"
            >
              + Virtual
            </button>
          </div>
        )}
      </div>

      {selectedDevice && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Sensor fields */}
          <div className="bg-bg-elevated rounded-2xl p-4 grid grid-cols-2 gap-3">
            <NumInput label="Ambient VOC" unit="ppm" value={form.ambient_voc} onChange={(v) => setF("ambient_voc", v)} />
            <NumInput label="Breath VOC" unit="ppm" value={form.breath_voc} onChange={(v) => setF("breath_voc", v)} />
            <NumInput label="Pressure Mean" unit="hPa" value={form.pressure_mean} onChange={(v) => setF("pressure_mean", v)} />
            <NumInput label="Pressure Std" unit="hPa" value={form.pressure_std} onChange={(v) => setF("pressure_std", v)} />
            <NumInput label="Breath Duration" unit="s" value={form.breath_duration} onChange={(v) => setF("breath_duration", v)} />
            <NumInput label="Temperature" unit="°C" value={form.temp_c} onChange={(v) => setF("temp_c", v)} />
            <NumInput label="Humidity" unit="%" value={form.humidity_pct} onChange={(v) => setF("humidity_pct", v)} />
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-text-muted">เวลา <span className="text-text-disabled font-normal">(ปล่อยว่าง = ตอนนี้)</span></label>
              <input
                type="datetime-local"
                value={form.time}
                onChange={(e) => setF("time", e.target.value)}
                className="w-full border border-border-soft rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-mint-500/30 transition bg-bg-surface"
              />
            </div>
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-text-muted">หมายเหตุ <span className="text-text-disabled font-normal">(audit trail)</span></label>
            <input
              type="text"
              value={form.note}
              onChange={(e) => setF("note", e.target.value)}
              placeholder="เช่น pilot day 3, fasting 16h"
              className="w-full border border-border-soft rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-mint-500/30 transition bg-bg-surface"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-danger text-sm">
              <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-mint-500 hover:bg-mint-600 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-all text-sm"
          >
            {submitting ? "กำลังประมวลผล..." : "บันทึกเข้า Database"}
          </button>
        </form>
      )}

      {/* Result card */}
      {result && (
        <div className="bg-success/5 border border-success/20 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-success">บันทึกสำเร็จ</span>
            <LabelBadge label={result.label} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-bg-surface rounded-xl p-3 space-y-1">
              <div className="text-xs text-text-disabled">Acetone Delta</div>
              <div className="text-xl font-bold text-text-primary">{result.acetone_delta?.toFixed(3) ?? "—"}</div>
              <div className="text-xs text-text-disabled">ppm</div>
            </div>
            <div className="bg-bg-surface rounded-xl p-3 space-y-1">
              <div className="text-xs text-text-disabled">Risk Index</div>
              <div className="text-xl font-bold text-text-primary">{result.metabolic_risk_index ?? "—"}</div>
              <div className="text-xs text-text-disabled">/ 10</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-text-disabled mb-1.5">Quality Score</div>
              <QualityBar score={result.quality_score} />
            </div>
            <div>
              <div className="text-xs text-text-disabled mb-1.5">Confidence</div>
              <QualityBar score={result.confidence_score !== null ? result.confidence_score! * 100 : null} />
            </div>
          </div>

          <div className="text-xs text-success text-right">
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
        <div className="text-xs font-semibold text-text-disabled uppercase tracking-wide">บทบาท</div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted capitalize">{user.role}</span>
          {user.role === "patient" && (
            <button
              onClick={handleMakeDoctor}
              disabled={busy}
              className="text-xs px-2.5 py-1 rounded-lg border border-border-soft text-text-muted hover:border-mint-500/30 hover:text-text-primary transition disabled:opacity-50"
            >
              ตั้งเป็นแพทย์
            </button>
          )}
        </div>
      </div>

      {user.role === "patient" && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-text-disabled uppercase tracking-wide">แพทย์ผู้ดูแล</div>
          <select
            value={user.assigned_doctor_id ?? ""}
            onChange={(e) => handleAssignDoctor(e.target.value)}
            disabled={busy}
            className="w-full border border-border-soft rounded-xl px-3.5 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-mint-500/30 transition bg-bg-surface disabled:opacity-50"
          >
            <option value="">ยังไม่กำหนด</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.display_name || d.username}</option>
            ))}
          </select>
          {doctors.length === 0 && (
            <div className="text-xs text-text-disabled">ยังไม่มีบัญชีแพทย์ — ตั้งผู้ใช้คนใดคนหนึ่งเป็นแพทย์ก่อน</div>
          )}
        </div>
      )}

      {error && (
        <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-danger text-sm">{error}</div>
      )}

      <div className="pt-2 border-t border-border-soft">
        {!confirmingDelete ? (
          <button
            onClick={() => setConfirmingDelete(true)}
            className="text-xs text-danger hover:text-danger transition px-3 py-2 rounded-lg hover:bg-danger/10"
          >
            ลบบัญชีผู้ใช้นี้
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">ยืนยันการลบบัญชี?</span>
            <button
              onClick={handleDelete}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg bg-danger hover:opacity-90 text-white transition disabled:opacity-50"
            >
              {busy ? "กำลังลบ..." : "ยืนยันลบ"}
            </button>
            <button
              onClick={() => setConfirmingDelete(false)}
              disabled={busy}
              className="text-xs px-3 py-1.5 rounded-lg border border-border-soft text-text-muted hover:border-mint-500/30 transition"
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

function matchesQuery(u: AdminUserOut, q: string): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return (
    (u.display_name ?? "").toLowerCase().includes(needle) ||
    u.username.toLowerCase().includes(needle) ||
    u.email.toLowerCase().includes(needle)
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { user: currentUser, loading: authLoading, logout } = useAuth();
  const [unlocked, setUnlocked] = useState(false);
  const [users, setUsers] = useState<AdminUserOut[]>([]);
  const [doctors, setDoctors] = useState<DoctorOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUserOut | null>(null);
  const [tab, setTab] = useState<Tab>("entry");
  const [query, setQuery] = useState("");
  const [assignSheetDoctorId, setAssignSheetDoctorId] = useState<string | null>(null);
  const [assignBusyUserId, setAssignBusyUserId] = useState<string | null>(null);
  const [createDoctorOpen, setCreateDoctorOpen] = useState(false);

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

  function handleDoctorCreated() {
    // The create-doctor response is just {id, username, display_name} — not
    // the full AdminUserOut shape UserCard needs (email, devices, reading
    // summary, etc.) — simplest correct approach is to re-fetch both lists
    // rather than hand-constructing a partial record with guessed defaults.
    setLoading(true);
    Promise.all([api.admin.listUsers(), api.admin.listDoctors()])
      .then(([u, d]) => { setUsers(u); setDoctors(d); })
      .finally(() => setLoading(false));
  }

  async function handleAssign(userId: string, doctorId: string | null) {
    setAssignBusyUserId(userId);
    try {
      await api.admin.assignDoctor(userId, doctorId);
      setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, assigned_doctor_id: doctorId } : u)));
      setSelectedUser((prev) => (prev && prev.id === userId ? { ...prev, assigned_doctor_id: doctorId } : prev));
    } catch {
      // Sheet stays open on failure — the user can retry; no toast infra
      // wired into this console today, matching the rest of this page.
    } finally {
      setAssignBusyUserId(null);
    }
  }

  const filtered = useMemo(() => users.filter((u) => matchesQuery(u, query)), [users, query]);
  const doctorUsers = useMemo(() => filtered.filter((u) => u.role === "doctor"), [filtered]);
  const unassignedPatients = useMemo(
    () => filtered.filter((u) => u.role === "patient" && !u.assigned_doctor_id), [filtered],
  );
  const assignedPatients = useMemo(
    () => filtered.filter((u) => u.role === "patient" && !!u.assigned_doctor_id), [filtered],
  );
  const adminUsers = useMemo(() => filtered.filter((u) => u.role === "admin"), [filtered]);

  const assignSheetDoctor = assignSheetDoctorId
    ? doctors.find((d) => d.id === assignSheetDoctorId) ?? null
    : null;

  if (!unlocked) return <PasswordGate onUnlock={handleUnlock} />;

  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-bg-surface border-b border-border-soft px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-mint-500 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <div>
            <h1 className="font-bold text-text-primary text-sm leading-none">Admin Console</h1>
            <p className="text-xs text-text-disabled mt-0.5">MetaBreath</p>
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
          className="text-xs text-text-disabled hover:text-text-muted transition px-3 py-1.5 rounded-lg hover:bg-bg-elevated"
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
              <div key={label} className="bg-bg-surface rounded-2xl border border-border-soft px-5 py-4">
                <div className="text-2xl font-bold text-text-primary">{value}</div>
                <div className="text-xs text-text-disabled mt-1">{label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Global AI fallback keys (OpenAI/Gemini) — server-side only, used
            when the primary Claude call fails or isn't configured. */}
        <div className="mb-6">
          <AdminAiFallbackPanel />
        </div>

        {/* Breath ↔ urine ketone agreement */}
        <div className="mb-6">
          <AdminAgreementPanel />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left — user list, grouped + searchable */}
          <div className="space-y-4">
            <UserSearchBar value={query} onChange={setQuery} />

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-bg-surface rounded-2xl border border-border-soft h-28 animate-pulse" />
                ))}
              </div>
            ) : (
              <>
                {/* Always visible (even at 0 doctors) so "add doctor" stays discoverable */}
                <UserGroupSection
                  title="แพทย์"
                  count={doctorUsers.length}
                  action={
                    <button
                      type="button"
                      onClick={() => setCreateDoctorOpen(true)}
                      className="flex items-center gap-1 text-xs font-medium text-mint-600 px-2 py-1 rounded-lg hover:bg-mint-500/10 transition"
                    >
                      <UserPlus2 size={13} /> เพิ่มแพทย์
                    </button>
                  }
                >
                  {doctorUsers.length === 0 ? (
                    <p className="text-sm text-text-disabled px-1 py-2">
                      {query.trim() ? "ไม่พบแพทย์ที่ตรงกับคำค้นหา" : "ยังไม่มีบัญชีแพทย์"}
                    </p>
                  ) : (
                    doctorUsers.map((u) => (
                      <div key={u.id} className="space-y-1.5">
                        <UserCard
                          user={u}
                          selected={selectedUser?.id === u.id}
                          onSelect={() => {
                            setSelectedUser(u.id === selectedUser?.id ? null : u);
                            setTab("entry");
                          }}
                          onOpen={() => router.push(`/admin/user/${u.id}`)}
                        />
                        <button
                          type="button"
                          onClick={() => setAssignSheetDoctorId(u.id)}
                          className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-mint-600 py-1.5 rounded-lg hover:bg-mint-500/10 transition"
                        >
                          <Stethoscope size={13} /> จัดการผู้ป่วย
                        </button>
                      </div>
                    ))
                  )}
                </UserGroupSection>

                {unassignedPatients.length > 0 && (
                  <UserGroupSection title="ผู้ป่วย — ยังไม่มีแพทย์ดูแล" count={unassignedPatients.length}>
                    {unassignedPatients.map((u) => (
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
                  </UserGroupSection>
                )}

                {assignedPatients.length > 0 && (
                  <UserGroupSection title="ผู้ป่วย — มีแพทย์แล้ว" count={assignedPatients.length} defaultOpen={false}>
                    {assignedPatients.map((u) => (
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
                  </UserGroupSection>
                )}

                {adminUsers.length > 0 && (
                  <UserGroupSection title="ผู้ดูแลระบบ" count={adminUsers.length} defaultOpen={false}>
                    {adminUsers.map((u) => (
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
                  </UserGroupSection>
                )}

                {filtered.length === 0 && (
                  <div className="bg-bg-surface rounded-2xl border border-dashed border-border-soft p-10 flex flex-col items-center justify-center text-center">
                    <Users2 size={22} className="text-text-disabled mb-3" strokeWidth={1.5} />
                    <p className="text-sm text-text-disabled">ไม่พบผู้ใช้ที่ตรงกับคำค้นหา</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right — entry panel */}
          <div className="lg:sticky lg:top-24 lg:self-start">
            {selectedUser ? (
              <div className="bg-bg-surface rounded-2xl border border-border-soft p-5">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="font-semibold text-text-primary">{selectedUser.display_name || selectedUser.username}</div>
                    <div className="text-xs text-text-disabled mt-0.5">{selectedUser.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => router.push(`/admin/user/${selectedUser.id}`)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-mint-500 text-white hover:bg-mint-600 transition"
                    >
                      ดูแดชบอร์ด
                    </button>
                    <button
                      onClick={() => setSelectedUser(null)}
                      className="w-7 h-7 rounded-lg bg-bg-elevated hover:bg-border-soft flex items-center justify-center transition text-text-muted"
                      aria-label="ปิด"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div className="flex gap-1 mb-5 border-b border-border-soft">
                  {([
                    { id: "entry", label: "กรอกข้อมูล" },
                    { id: "actions", label: "จัดการ" },
                  ] as { id: Tab; label: string }[]).map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      className={`text-xs font-medium px-3 py-2 -mb-px border-b-2 transition ${
                        tab === t.id
                          ? "border-mint-500 text-text-primary"
                          : "border-transparent text-text-disabled hover:text-text-muted"
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
              <div className="bg-bg-surface rounded-2xl border border-dashed border-border-soft p-10 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 rounded-full bg-bg-elevated flex items-center justify-center mb-3">
                  <svg className="w-6 h-6 text-text-disabled" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M15 19l-7-7 7-7" />
                  </svg>
                </div>
                <div className="text-sm font-medium text-text-disabled">เลือกผู้ใช้ทางซ้าย</div>
                <div className="text-xs text-text-disabled mt-1">เพื่อกรอกข้อมูล sensor</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {assignSheetDoctor && (
        <AssignPatientsPanel
          doctor={assignSheetDoctor}
          users={users}
          open={!!assignSheetDoctorId}
          onOpenChange={(open) => { if (!open) setAssignSheetDoctorId(null); }}
          onAssign={handleAssign}
          busyUserId={assignBusyUserId}
        />
      )}

      <CreateDoctorSheet
        open={createDoctorOpen}
        onOpenChange={setCreateDoctorOpen}
        onCreated={handleDoctorCreated}
      />
    </div>
  );
}
