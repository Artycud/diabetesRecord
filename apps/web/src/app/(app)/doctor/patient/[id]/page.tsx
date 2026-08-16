"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { PatientAcetoneChart } from "@/components/charts/PatientAcetoneChart";
import { AiInterpretCard } from "@/components/cards/AiInterpretCard";
import { ReportView } from "@/components/health/ReportView";

const DAY_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

/**
 * /doctor/patient/[id] — a doctor's full view of one assigned patient:
 * acetone-over-time chart, AI conclusion, and the same detailed report
 * (average ppm / baseline, trend, sessions, lifestyle) the patient sees
 * about themselves on /me/report — via ReportView, shared verbatim so the
 * numbers can never visually drift between the two views.
 */
export default function DoctorPatientPage() {
  const params = useParams<{ id: string }>();
  const patientId = params?.id;
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [days, setDays] = useState(7);

  useEffect(() => {
    if (authLoading) return;
    if (user?.role !== "doctor") router.replace("/home");
  }, [authLoading, user, router]);

  const enabled = user?.role === "doctor" && !!patientId;

  const { data: dashboard, isLoading: dashboardLoading } = useQuery({
    queryKey: ["doctor", "dashboard", patientId, days],
    queryFn: () => api.doctor.getPatientDashboard(patientId!, days),
    enabled,
  });

  const { data: report, isLoading: reportLoading, isError: reportError } = useQuery({
    queryKey: ["doctor", "report", patientId],
    queryFn: () => api.doctor.getPatientReport(patientId!, {}),
    enabled,
  });

  if (authLoading || user?.role !== "doctor") return null;

  return (
    <div className="max-w-2xl mx-auto px-4 pt-12 md:pt-6 pb-24 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/doctor"
            className="h-9 w-9 rounded-full bg-bg-elevated flex items-center justify-center shrink-0"
            aria-label="Back"
          >
            <ArrowLeft size={18} className="text-text-muted" />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-text-primary tracking-tight truncate">
              {dashboard?.user.display_name || dashboard?.user.username || "Patient"}
            </h1>
            {dashboard?.user.email && (
              <p className="text-xs text-text-muted mt-0.5 truncate">{dashboard.user.email}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 bg-bg-elevated rounded-lg p-1 shrink-0">
          {DAY_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition ${
                days === opt.days ? "bg-bg-surface text-text-primary shadow-sm" : "text-text-disabled hover:text-text-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <PatientAcetoneChart series={dashboard?.series ?? []} loading={dashboardLoading} days={days} />

      <AiInterpretCard
        patientId={patientId}
        deviceId={report?.device_id ?? dashboard?.devices?.[0]?.id ?? null}
      />

      {reportLoading && (
        <div className="flex items-center justify-center" style={{ minHeight: "30vh" }}>
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-mint-500 border-t-transparent" />
        </div>
      )}

      {reportError && !reportLoading && (
        <Card>
          <CardContent className="text-center py-10">
            <AlertTriangle size={24} className="text-warning mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-text-muted">Couldn&apos;t load this patient&apos;s report.</p>
          </CardContent>
        </Card>
      )}

      {report && !reportError && <ReportView report={report} />}
    </div>
  );
}
