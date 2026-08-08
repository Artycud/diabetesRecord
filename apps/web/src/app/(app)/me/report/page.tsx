"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowLeft, Printer, Activity, ArrowUpRight, ArrowDownRight,
  AlertTriangle, MinusCircle, Gauge, Utensils, Dumbbell, Scale, TestTube, Stethoscope,
} from "lucide-react";
import { api, type TrendClass } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useTimezone } from "@/lib/timezone";
import { convertFromMv, useUnits } from "@/lib/units";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * /me/report — Task D3: a real, printable health-report page that pulls
 * everything else this wave built (trend classification, personal baseline,
 * session history, lifestyle logs) into one doctor/self-facing summary,
 * via a single GET /sensor/report call.
 *
 * Deliberately separate from /me/device/[id]/report, which is the existing
 * device-QA / sensor-calibration report — this one is about the person's
 * health data, not the hardware.
 */

const TREND_STYLE: Record<TrendClass, { icon: typeof Activity; color: string }> = {
  stable:     { icon: Activity,       color: "#10B981" },
  increasing: { icon: ArrowUpRight,   color: "#F59E0B" },
  decreasing: { icon: ArrowDownRight, color: "#0EA5E9" },
  abnormal:   { icon: AlertTriangle,  color: "#F43F5E" },
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold uppercase tracking-widest text-text-muted mb-3">
      {children}
    </h2>
  );
}

export default function HealthReportPage() {
  const { t } = useT();
  const { formatDateTime, formatDate } = useTimezone();
  const { unit: acUnit, label: acUnitLbl } = useUnits();
  const acDecimals = acUnit === "mV" ? 0 : 2;

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
            className="btn-premium flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shrink-0 active:scale-95 transition-transform"
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
          {!report.device_id && (
            <Card forceAppearance="flat" className="border border-warning/20 bg-warning/5">
              <CardContent className="py-3 text-sm text-warning">{t("report.noDevice")}</CardContent>
            </Card>
          )}

          {/* Generated-at + user, screen only (print version is above) */}
          <p className="text-xs text-text-muted print:hidden">
            {t("report.generatedAt")} {formatDateTime(report.generated_at)}
          </p>

          {/* Trend */}
          <Card className="print:border print:border-border-soft print:shadow-none">
            <CardContent>
              <SectionTitle>{t("report.trendSection")}</SectionTitle>
              {report.trend.trend ? (
                (() => {
                  const trend = report.trend.trend as TrendClass;
                  const style = TREND_STYLE[trend] ?? { icon: MinusCircle, color: "#9CA3AF" };
                  const Icon = style.icon;
                  return (
                    <div className="flex items-center gap-3">
                      <div
                        className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: `${style.color}1A`, color: style.color }}
                      >
                        <Icon size={18} />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-text-primary">{t(`trendClass.${trend}`)}</p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {t("trendClass.basedOn", { n: report.trend.sequence_length })} ·{" "}
                          {Math.round(report.trend.confidence * 100)}%
                        </p>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <p className="text-sm text-text-muted">{t("trendClass.unknown")}</p>
              )}
            </CardContent>
          </Card>

          {/* Baseline */}
          <Card className="print:border print:border-border-soft print:shadow-none">
            <CardContent>
              <SectionTitle>{t("report.baselineSection")}</SectionTitle>
              {report.baseline.insufficient_data ? (
                <div className="flex items-start gap-3">
                  <Gauge size={18} className="text-text-muted shrink-0 mt-0.5" strokeWidth={1.6} />
                  <p className="text-sm text-text-muted">{t("trends.baseline.insufficientDesc")}</p>
                </div>
              ) : (
                <div className="flex items-start gap-3">
                  <Gauge size={18} className="text-mint-500 shrink-0 mt-0.5" strokeWidth={1.6} />
                  <div>
                    <p className="text-base font-semibold text-text-primary">
                      {report.baseline.baseline_mean_mv != null
                        ? convertFromMv(report.baseline.baseline_mean_mv, acUnit).toFixed(acDecimals)
                        : "—"}{" "}
                      <span className="text-xs font-normal text-text-muted">{acUnitLbl}</span>
                    </p>
                    {report.baseline.baseline_range_mv && (
                      <p className="text-xs text-text-muted mt-0.5">
                        {t("trends.baseline.range")}:{" "}
                        {convertFromMv(report.baseline.baseline_range_mv[0], acUnit).toFixed(acDecimals)}
                        {"–"}
                        {convertFromMv(report.baseline.baseline_range_mv[1], acUnit).toFixed(acDecimals)} {acUnitLbl}
                      </p>
                    )}
                    <p className="text-[11px] text-text-disabled mt-1">
                      {t("trends.baseline.basedOn", {
                        n: report.baseline.sample_count,
                        days: report.baseline.computed_from_days,
                      })}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Doctor */}
          <Card className="print:border print:border-border-soft print:shadow-none">
            <CardContent className="flex items-center gap-3">
              <Stethoscope size={18} className="text-blue-400 shrink-0" strokeWidth={1.6} />
              <div>
                <SectionTitle>{t("report.doctorSection")}</SectionTitle>
                {/* Report payload only carries the doctor's id (not a display
                    name — that lookup is admin-only), so this just confirms
                    whether a doctor is assigned rather than showing a raw UUID. */}
                <p className="text-sm text-text-primary -mt-2">
                  {report.user.assigned_doctor_id
                    ? `${t("report.doctorSection")} · #${report.user.assigned_doctor_id.slice(0, 8)}`
                    : t("report.noDoctor")}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Recent sessions */}
          <Card className="print:border print:border-border-soft print:shadow-none">
            <CardContent>
              <div className="flex items-center justify-between mb-3">
                <SectionTitle>{t("report.sessionsSection")}</SectionTitle>
                {report.recent_sessions.length > 0 && (
                  <Badge variant="mint">{report.recent_sessions.length}</Badge>
                )}
              </div>
              {report.recent_sessions.length === 0 ? (
                <p className="text-sm text-text-muted">{t("report.noSessions")}</p>
              ) : (
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border-soft text-muted">
                        <th className="text-left  py-2 font-semibold">เวลา</th>
                        <th className="text-right py-2 font-semibold">เฉลี่ย</th>
                        <th className="text-right py-2 font-semibold">สูงสุด</th>
                        <th className="text-right py-2 font-semibold">ระดับ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.recent_sessions.slice(0, 20).map((s) => (
                        <tr key={s.session_id} className="border-b border-border-soft/60">
                          <td className="py-2 text-text-primary">{formatDate(s.started_at)}</td>
                          <td className="py-2 text-right font-mono text-text-primary">
                            {s.mean_acetone_delta != null ? convertFromMv(s.mean_acetone_delta, acUnit).toFixed(acDecimals) : "—"}
                          </td>
                          <td className="py-2 text-right font-mono text-muted">
                            {s.peak_acetone_delta != null ? convertFromMv(s.peak_acetone_delta, acUnit).toFixed(acDecimals) : "—"}
                          </td>
                          <td className="py-2 text-right text-muted">{s.dominant_label ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Lifestyle summary */}
          <Card className="print:border print:border-border-soft print:shadow-none">
            <CardContent>
              <SectionTitle>
                {t("report.lifestyleSection")} · {t("trends.baseline.basedOn", {
                  n: report.lifestyle_summary.meals.length
                    + report.lifestyle_summary.activities.length
                    + report.lifestyle_summary.weights.length
                    + report.lifestyle_summary.ketones.length,
                  days: report.lifestyle_summary.window_days,
                })}
              </SectionTitle>

              {report.lifestyle_summary.meals.length === 0
                && report.lifestyle_summary.activities.length === 0
                && report.lifestyle_summary.weights.length === 0
                && report.lifestyle_summary.ketones.length === 0 ? (
                <p className="text-sm text-text-muted">{t("report.noLifestyle")}</p>
              ) : (
                <div className="space-y-4">
                  {report.lifestyle_summary.meals.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5 mb-1.5">
                        <Utensils size={12} className="text-amber-500" /> {t("report.meals")}
                      </p>
                      <ul className="space-y-1">
                        {report.lifestyle_summary.meals.slice(0, 8).map((m, i) => (
                          <li key={i} className="text-xs text-text-muted flex justify-between gap-2">
                            <span className="truncate">{m.name}</span>
                            <span className="shrink-0 font-mono">{formatDate(m.ts)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {report.lifestyle_summary.activities.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5 mb-1.5">
                        <Dumbbell size={12} className="text-blue-400" /> {t("report.activities")}
                      </p>
                      <ul className="space-y-1">
                        {report.lifestyle_summary.activities.slice(0, 8).map((a, i) => (
                          <li key={i} className="text-xs text-text-muted flex justify-between gap-2">
                            <span className="truncate">{a.kind} · {a.duration_min} min</span>
                            <span className="shrink-0 font-mono">{formatDate(a.ts)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {report.lifestyle_summary.weights.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5 mb-1.5">
                        <Scale size={12} className="text-amber-700" /> {t("report.weights")}
                      </p>
                      <ul className="space-y-1">
                        {report.lifestyle_summary.weights.slice(0, 8).map((w, i) => (
                          <li key={i} className="text-xs text-text-muted flex justify-between gap-2">
                            <span>{w.kg} kg</span>
                            <span className="shrink-0 font-mono">{formatDate(w.ts)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {report.lifestyle_summary.ketones.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5 mb-1.5">
                        <TestTube size={12} className="text-mint-500" /> {t("report.ketones")}
                      </p>
                      <ul className="space-y-1">
                        {report.lifestyle_summary.ketones.slice(0, 8).map((k, i) => (
                          <li key={i} className="text-xs text-text-muted flex justify-between gap-2">
                            <span>{k.value_mmol != null ? `${k.value_mmol.toFixed(2)} mmol/L` : "—"} ({k.type})</span>
                            <span className="shrink-0 font-mono">{formatDate(k.ts)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <p className="text-[11px] text-text-disabled leading-relaxed print:mt-2">
            {t("aiInterpret.disclaimer")}
          </p>
        </>
      )}
    </div>
  );
}
