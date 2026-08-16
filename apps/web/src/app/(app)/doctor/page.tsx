"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Stethoscope, Users } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useTimezone } from "@/lib/timezone";
import { backendLabelToZone, LABEL_TH, LABEL_EN } from "@/lib/riskLabel";
import { HistoryRow } from "@/components/cards/HistoryRow";

/**
 * /doctor — a doctor's roster of assigned patients (Profile.assigned_doctor_id
 * == this doctor's id, set by admin via /admin/users/{id}/assign-doctor).
 * Click-through goes to /doctor/patient/[id] for the full report/conclusion/
 * chart, mirroring the admin per-user dashboard's summary-card -> detail-page
 * shape rather than inventing a new navigation pattern.
 */
export default function DoctorPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { locale } = useT();
  const { formatDateTime } = useTimezone();
  const ZONE_LABELS = locale === "th" ? LABEL_TH : LABEL_EN;

  useEffect(() => {
    if (authLoading) return;
    if (user?.role !== "doctor") router.replace("/home");
  }, [authLoading, user, router]);

  const { data: patients, isLoading } = useQuery({
    queryKey: ["doctor", "patients"],
    queryFn: api.doctor.listPatients,
    enabled: user?.role === "doctor",
  });

  if (authLoading || user?.role !== "doctor") return null;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-12 md:pt-6 pb-24 space-y-5">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-xl bg-mint-500/15 flex items-center justify-center shrink-0">
          <Stethoscope size={18} className="text-mint-500" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">Doctor Console</h1>
          <p className="text-xs text-text-muted mt-0.5">Your assigned patients</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center" style={{ minHeight: "30vh" }}>
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-mint-500 border-t-transparent" />
        </div>
      )}

      {!isLoading && patients && patients.length === 0 && (
        <div className="rounded-2xl bg-bg-surface border border-border-soft p-8 text-center">
          <Users size={22} className="text-text-disabled mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-sm text-text-muted">No patients assigned yet.</p>
          <p className="text-xs text-text-disabled mt-1">An admin assigns patients to your account.</p>
        </div>
      )}

      {!isLoading && patients && patients.length > 0 && (
        <div className="bg-bg-surface rounded-2xl border border-border-soft overflow-hidden px-2 py-1">
          {patients.map((p) => (
            <Link key={p.id} href={`/doctor/patient/${p.id}`}>
              <HistoryRow
                title={p.display_name || p.username}
                subtitle={p.last_reading_at ? formatDateTime(p.last_reading_at) : "No readings yet"}
                primary={p.last_label ? (ZONE_LABELS[backendLabelToZone(p.last_label)] ?? p.last_label) : "—"}
                secondary={`${p.device_count} device${p.device_count !== 1 ? "s" : ""}`}
              />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
