"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, Printer, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useTimezone } from "@/lib/timezone";
import { Card, CardContent } from "@/components/ui/card";
import { ReportView } from "@/components/health/ReportView";

/**
 * /me/report — Task D3: a real, printable health-report page that pulls
 * everything else this wave built (trend classification, personal baseline,
 * session history, lifestyle logs) into one doctor/self-facing summary,
 * via a single GET /sensor/report call. The rendering itself lives in
 * ReportView (components/health/ReportView.tsx), shared with the doctor's
 * view of an assigned patient (/doctor/patient/[id]) so both render
 * identically from the same SensorReport shape.
 *
 * Deliberately separate from /me/device/[id]/report, which is the existing
 * device-QA / sensor-calibration report — this one is about the person's
 * health data, not the hardware.
 */
export default function HealthReportPage() {
  const { t } = useT();
  const { formatDateTime } = useTimezone();

  const { data: report, isLoading, isError } = useQuery({
    queryKey: ["sensor", "report"],
    queryFn: () => api.sensor.getReport({}),
  });

  return (
    <div className="max-w-2xl mx-auto px-4 pt-12 md:pt-6 pb-24 space-y-5 print:pb-6 print:pt-4">
      {/* Header — hidden on print, replaced by the plain title block below it */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href="/me"
            className="h-9 w-9 rounded-full bg-bg-elevated flex items-center justify-center shrink-0"
            aria-label={t("common.back")}
          >
            <ArrowLeft size={18} className="text-text-muted" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-text-primary tracking-tight">{t("report.title")}</h1>
            <p className="text-xs text-text-muted mt-0.5">{t("report.subtitle")}</p>
          </div>
        </div>
        {report && (
          <button
            onClick={() => window.print()}
            className="bg-mint-500 hover:bg-mint-600 flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shrink-0 active:scale-95 transition-transform"
          >
            <Printer size={14} />
            {t("report.print")}
          </button>
        )}
      </div>

      {/* Print-only plain title (no nav chrome, no colored button) */}
      {report && (
        <div className="hidden print:block">
          <h1 className="text-2xl font-bold text-text-primary">{t("report.title")}</h1>
          <p className="text-sm text-text-muted mt-1">
            {report.user.display_name ?? "—"} · {t("report.generatedAt")} {formatDateTime(report.generated_at)}
          </p>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center" style={{ minHeight: "40vh" }}>
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-mint-500 border-t-transparent" />
        </div>
      )}

      {isError && !isLoading && (
        <Card>
          <CardContent className="text-center py-10">
            <AlertTriangle size={24} className="text-warning mx-auto mb-3" strokeWidth={1.5} />
            <p className="text-sm text-text-muted">{t("report.loadError")}</p>
          </CardContent>
        </Card>
      )}

      {report && !isError && (
        <>
          {/* Generated-at + user, screen only (print version is above) */}
          <p className="text-xs text-text-muted print:hidden">
            {t("report.generatedAt")} {formatDateTime(report.generated_at)}
          </p>

          <ReportView report={report} />
        </>
      )}
    </div>
  );
}
