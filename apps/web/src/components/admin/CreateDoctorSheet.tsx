"use client";

import { useState } from "react";
import { api, type DoctorOut } from "@/lib/api";
import { Sheet } from "@/components/ui/Sheet";

const FIELD_CLASS =
  "w-full border border-border-soft rounded-xl px-3.5 py-2.5 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-2 focus:ring-mint-500/30 focus:border-mint-500/40 transition bg-bg-surface";

/**
 * Admin-only creation of a doctor account directly (not promoting an
 * existing patient) — calls POST /admin/doctors, which creates the account
 * as role="doctor" from the start and skips the patient onboarding flow
 * (nothing in it applies to a doctor persona).
 */
export function CreateDoctorSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (doctor: DoctorOut) => void;
}) {
  const [form, setForm] = useState({ display_name: "", username: "", email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function setF(k: keyof typeof form, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
    setError("");
  }

  function reset() {
    setForm({ display_name: "", username: "", email: "", password: "" });
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const doctor = await api.admin.createDoctor(form);
      onCreated(doctor);
      reset();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }} title="สร้างบัญชีแพทย์ใหม่">
      <form onSubmit={handleSubmit} className="space-y-4 pb-2">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-muted">ชื่อที่แสดง</label>
          <input
            value={form.display_name}
            onChange={(e) => setF("display_name", e.target.value)}
            placeholder="เช่น นพ. สมชาย ใจดี"
            required
            className={FIELD_CLASS}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-muted">Username</label>
          <input
            value={form.username}
            onChange={(e) => setF("username", e.target.value)}
            placeholder="somchai_dr"
            required
            pattern="[a-zA-Z0-9_]{3,30}"
            title="3-30 ตัวอักษร, ตัวอักษร/ตัวเลข/underscore เท่านั้น"
            className={FIELD_CLASS}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-muted">อีเมล</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setF("email", e.target.value)}
            placeholder="doctor@example.com"
            required
            className={FIELD_CLASS}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-text-muted">รหัสผ่านชั่วคราว</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setF("password", e.target.value)}
            placeholder="อย่างน้อย 8 ตัวอักษร"
            required
            minLength={8}
            className={FIELD_CLASS}
          />
        </div>

        {error && (
          <div className="bg-danger/10 border border-danger/20 rounded-xl px-4 py-3 text-danger text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-mint-500 hover:bg-mint-600 disabled:opacity-40 text-white font-semibold py-3 rounded-xl transition-all text-sm"
        >
          {submitting ? "กำลังสร้าง..." : "สร้างบัญชีแพทย์"}
        </button>
      </form>
    </Sheet>
  );
}
