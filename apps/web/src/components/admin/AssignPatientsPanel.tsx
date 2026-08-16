"use client";

import { useMemo, useState } from "react";
import { UserPlus, UserMinus } from "lucide-react";
import type { AdminUserOut, DoctorOut } from "@/lib/api";
import { Sheet } from "@/components/ui/Sheet";
import { UserSearchBar } from "@/components/admin/UserSearchBar";

function matchesQuery(u: AdminUserOut, q: string): boolean {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return (
    (u.display_name ?? "").toLowerCase().includes(needle) ||
    u.username.toLowerCase().includes(needle) ||
    u.email.toLowerCase().includes(needle)
  );
}

/**
 * Doctor-centric assignment flow: pick a doctor (opened from the "Doctors"
 * group on the main admin page), search for a patient by name/username/
 * email, and assign them to this doctor — matches the requested "search bar
 * to choose who to add, then assign to: this doctor" flow. Reuses the
 * existing POST /admin/users/{id}/assign-doctor endpoint exactly as-is in
 * both directions (add == assign to this doctor, remove == assign to null);
 * no backend change needed for this panel.
 */
export function AssignPatientsPanel({
  doctor,
  users,
  open,
  onOpenChange,
  onAssign,
  busyUserId,
}: {
  doctor: DoctorOut;
  users: AdminUserOut[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAssign: (userId: string, doctorId: string | null) => void;
  busyUserId: string | null;
}) {
  const [query, setQuery] = useState("");

  const assigned = useMemo(
    () => users.filter((u) => u.role === "patient" && u.assigned_doctor_id === doctor.id),
    [users, doctor.id],
  );
  const candidates = useMemo(
    () =>
      users.filter(
        (u) => u.role === "patient" && u.assigned_doctor_id !== doctor.id && matchesQuery(u, query),
      ),
    [users, doctor.id, query],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={`ผู้ป่วยของ ${doctor.display_name || doctor.username}`}>
      <div className="space-y-5 pb-2">
        <div>
          <p className="text-xs font-semibold text-text-disabled uppercase tracking-wide mb-2">
            กำลังดูแล ({assigned.length})
          </p>
          {assigned.length === 0 ? (
            <p className="text-sm text-text-disabled py-2">ยังไม่มีผู้ป่วยที่มอบหมาย</p>
          ) : (
            <div className="space-y-1.5">
              {assigned.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border-soft px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{u.display_name || u.username}</p>
                    <p className="text-xs text-text-disabled truncate">{u.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAssign(u.id, null)}
                    disabled={busyUserId === u.id}
                    className="shrink-0 flex items-center gap-1 text-xs font-medium text-danger px-2.5 py-1.5 rounded-lg hover:bg-danger/10 disabled:opacity-50 transition"
                  >
                    <UserMinus size={13} /> นำออก
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="text-xs font-semibold text-text-disabled uppercase tracking-wide mb-2">เพิ่มผู้ป่วย</p>
          <UserSearchBar value={query} onChange={setQuery} placeholder="ค้นหาผู้ป่วยที่จะเพิ่ม..." />
          <div className="space-y-1.5 mt-3 max-h-64 overflow-y-auto">
            {candidates.length === 0 ? (
              <p className="text-sm text-text-disabled py-2">ไม่พบผู้ป่วยที่ตรงกับคำค้นหา</p>
            ) : (
              candidates.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border-soft px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{u.display_name || u.username}</p>
                    <p className="text-xs text-text-disabled truncate">
                      {u.email}
                      {u.assigned_doctor_id && u.assigned_doctor_id !== doctor.id && " · มีแพทย์ผู้ดูแลแล้ว"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onAssign(u.id, doctor.id)}
                    disabled={busyUserId === u.id}
                    className="shrink-0 flex items-center gap-1 text-xs font-medium text-mint-600 px-2.5 py-1.5 rounded-lg hover:bg-mint-500/10 disabled:opacity-50 transition"
                  >
                    <UserPlus size={13} /> เพิ่ม
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
