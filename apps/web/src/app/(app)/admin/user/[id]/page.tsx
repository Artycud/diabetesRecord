"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip,
} from "recharts";
import { api, UserDashboardOut, DashboardReading } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PatientAcetoneChart } from "@/components/charts/PatientAcetoneChart";

// ── Label colors (theme tokens, not ad-hoc hex, for dark-mode correctness) ──
const LABEL_COLOR: Record<string, string> = {
  clean:      "var(--color-success)",
  low:        "var(--color-success)",
  moderate:   "var(--color-warning)",
  high:       "var(--color-danger)",
  unreliable: "var(--color-info)",
  normal:     "var(--color-success)",
  elevated:   "var(--color-warning)",
  very_high:  "var(--color-danger)",
  unknown:    "var(--color-text-disabled)",
};

const LABEL_TH: Record<string, string> = {
  clean:      "อากาศสะอาด",
  low:        "ต่ำ",
  moderate:   "ปานกลาง",
  high:       "สูง",
  unreliable: "เชื่อถือไม่ได้",
  normal:     "ปกติ",
  elevated:   "สูงขึ้น",
  very_high:  "สูงมาก",
  unknown:    "ไม่ระบุ",
};

const DAY_OPTIONS = [
  { label: "24 ชม.", days: 1 },
  { label: "7 วัน",  days: 7 },
  { label: "30 วัน", days: 30 },
];

// ── Small UI atoms ──────────────────────────────────────────────────────────
function LabelBadge({ label }: { label: string | null }) {
  if (!label) return <span className="text-xs text-text-disabled">—</span>;
  const color = LABEL_COLOR[label] ?? "var(--color-text-disabled)";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      {LABEL_TH[label] ?? label}
    </span>
  );
}

function fmt(v: number | null | undefined, digits = 2, unit = ""): string {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-text-disabled">{label}</span>
      <span className="text-xs font-mono text-text-primary break-all">{value}</span>
    </div>
  );
}

function RecentRow({ r }: { r: DashboardReading }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        onClick={() => setOpen((v) => !v)}
        className="border-b border-border-soft/60 hover:bg-bg-elevated cursor-pointer"
      >
        <td className="px-2 py-2 text-text-disabled text-center">
          <svg
            className={`w-3 h-3 inline-block transition-transform ${open ? "rotate-90" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
          </svg>
        </td>
        <td className="px-3 py-2 text-xs text-text-muted whitespace-nowrap">
          {new Date(r.time).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
        </td>
        <td className="px-3 py-2 text-right font-mono text-xs text-text-primary">{fmt(r.acetone_delta)}</td>
        <td className="px-3 py-2 text-right font-mono text-xs text-text-muted">{fmt(r.pressure_mean)}</td>
        <td className="px-3 py-2 text-right font-mono text-xs text-text-muted">
          {r.temp_c !== null && r.humidity_pct !== null
            ? `${r.temp_c.toFixed(0)}°/${r.humidity_pct.toFixed(0)}%`
            : "—"}
        </td>
        <td className="px-3 py-2 text-right font-mono text-xs text-text-muted">
          {r.quality_score !== null ? r.quality_score.toFixed(0) : "—"}
        </td>
        <td className="px-5 py-2 text-right">
          <LabelBadge label={r.label} />
        </td>
      </tr>
      {open && (
        <tr className="bg-bg-elevated border-b border-border-soft/60">
          <td />
          <td colSpan={6} className="px-3 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-3">
              <Field label="Ambient VOC" value={fmt(r.ambient_voc, 3, "ppm")} />
              <Field label="Breath VOC"  value={fmt(r.breath_voc,  3, "ppm")} />
              <Field label="Acetone Δ"   value={fmt(r.acetone_delta, 3, "ppm")} />
              <Field label="VOC ppb"     value={fmt(r.voc_ppb, 1)} />
              <Field label="Ketone"      value={fmt(r.ketone_mmol, 2, "mmol/L")} />
              <Field label="Temp"        value={fmt(r.temp_c, 1, "°C")} />
              <Field label="Humidity"    value={fmt(r.humidity_pct, 1, "%")} />
              <Field label="Pressure μ"  value={fmt(r.pressure_mean, 2)} />
              <Field label="Pressure σ"  value={fmt(r.pressure_std,  2)} />
              <Field label="Breath dur." value={fmt(r.breath_duration, 2, "s")} />
              <Field label="Quality"     value={fmt(r.quality_score, 1)} />
              <Field label="Reliability" value={fmt(r.reliability_score, 1)} />
              <Field label="Env. penalty" value={fmt(r.environment_penalty, 2)} />
              <Field label="Slope"       value={fmt(r.slope, 3)} />
              <Field label="Time-to-peak" value={fmt(r.time_to_peak, 2, "s")} />
              <Field label="Recovery"    value={fmt(r.recovery_rate, 3)} />
              <Field label="MRI"         value={r.metabolic_risk_index ?? "—"} />
              <Field label="Confidence"  value={fmt(r.confidence_score, 2)} />
              <Field label="Device"      value={<span className="text-[10px]">{r.device_id}</span>} />
              <Field label="Label"       value={r.label ?? "—"} />
            </div>
            {r.raw && Object.keys(r.raw).length > 0 && (
              <details className="mt-4">
                <summary className="text-[11px] uppercase tracking-wide text-text-disabled cursor-pointer hover:text-text-muted">
                  Raw payload (JSON)
                </summary>
                <pre className="mt-2 bg-bg-surface border border-border-soft rounded-lg p-3 text-[11px] font-mono text-text-muted overflow-x-auto">
{JSON.stringify(r.raw, null, 2)}
                </pre>
              </details>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-bg-surface rounded-2xl border border-border-soft p-5">
      <div className="text-xs text-text-disabled uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-text-primary mt-1">{value}</div>
      {sub && <div className="text-xs text-text-disabled mt-0.5">{sub}</div>}
    </div>
  );
}

// ── Link Device Modal ──────────────────────────────────────────────────────
function LinkDeviceModal({
  userId,
  userEmail,
  onClose,
  onLinked,
}: {
  userId: string;
  userEmail: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const [tab, setTab] = useState<"mac" | "id">("mac");
  const [mac, setMac] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function handleSubmit() {
    setErr("");
    setLoading(true);
    try {
      if (tab === "mac") {
        await api.admin.registerMacDevice(mac.trim(), userEmail);
      } else {
        await api.admin.assignDevice(deviceId.trim(), userId);
      }
      onLinked();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "เกิดข้อผิดพลาด");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-bg-surface rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold text-text-primary mb-4">Link Device ให้ User นี้</h3>

        <div className="flex gap-1 bg-bg-elevated rounded-lg p-1 mb-4">
          <button
            onClick={() => setTab("mac")}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${tab === "mac" ? "bg-bg-surface text-text-primary shadow-sm" : "text-text-disabled"}`}
          >
            ลงทะเบียน MAC ใหม่
          </button>
          <button
            onClick={() => setTab("id")}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition ${tab === "id" ? "bg-bg-surface text-text-primary shadow-sm" : "text-text-disabled"}`}
          >
            โอน Device ที่มีอยู่
          </button>
        </div>

        {tab === "mac" ? (
          <div className="space-y-2">
            <label className="text-xs text-text-muted">MAC Address (12 hex chars)</label>
            <input
              value={mac}
              onChange={(e) => setMac(e.target.value)}
              placeholder="เช่น 88F155302810"
              className="w-full border border-border-soft bg-bg-primary rounded-lg px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:ring-2 focus:ring-mint-500"
            />
            <p className="text-[11px] text-text-disabled">จะ link กับ email: <span className="font-mono">{userEmail}</span></p>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-xs text-text-muted">Device UUID</label>
            <input
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full border border-border-soft bg-bg-primary rounded-lg px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:ring-2 focus:ring-mint-500"
            />
            <p className="text-[11px] text-text-disabled">Device จะถูกโอนมาอยู่ภายใต้ user นี้ทันที</p>
          </div>
        )}

        {err && <p className="text-xs text-danger mt-2">{err}</p>}

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-border-soft text-sm text-text-muted hover:bg-bg-elevated">
            ยกเลิก
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || (tab === "mac" ? !mac.trim() : !deviceId.trim())}
            className="flex-1 py-2 rounded-lg bg-mint-500 text-white text-sm font-medium hover:bg-mint-600 disabled:opacity-40 transition"
          >
            {loading ? "กำลัง link..." : "Link Device"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function UserDashboardPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user: currentUser, loading: authLoading } = useAuth();
  const [days, setDays] = useState(7);
  const [data, setData] = useState<UserDashboardOut | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);

  // Load dashboard whenever id or window changes
  useEffect(() => {
    const id = params?.id;
    if (!id) return;
    setLoading(true);
    setErr("");
    api.admin
      .userDashboard(id, days)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"))
      .finally(() => setLoading(false));
  }, [params?.id, days]);

  // Bounce back to /admin unless this is either a role-based admin (JWT
  // alone is enough, same as the /admin PasswordGate's isRoleAdmin path) or
  // a legacy admin who already unlocked the password gate this session.
  useEffect(() => {
    if (authLoading) return;
    const isRoleAdmin = currentUser?.role === "admin";
    const hasPasswordSession = typeof window !== "undefined" && !!sessionStorage.getItem("admin_password");
    if (!isRoleAdmin && !hasPasswordSession) {
      router.replace("/admin");
    }
  }, [authLoading, currentUser, router]);

  const donutData = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.label_counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [data]);

  if (err) {
    return (
      <div className="min-h-screen bg-bg-primary flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="text-danger text-sm mb-4">{err}</div>
          <button
            onClick={() => router.push("/admin")}
            className="text-sm text-mint-600 hover:text-mint-500 underline"
          >
            ← กลับ Admin Console
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="min-h-screen bg-bg-primary">
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-bg-surface border-b border-border-soft px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push("/admin")}
            className="w-8 h-8 rounded-lg bg-bg-elevated hover:bg-border-soft flex items-center justify-center transition text-text-muted"
            aria-label="กลับ"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {data ? (
            <div className="min-w-0">
              <div className="font-semibold text-text-primary text-sm truncate">
                {data.user.display_name || data.user.username}
              </div>
              <div className="text-xs text-text-disabled truncate">{data.user.email}</div>
            </div>
          ) : (
            <div className="h-8 w-40 bg-bg-elevated rounded animate-pulse" />
          )}
        </div>

        <div className="flex items-center gap-1 bg-bg-elevated rounded-lg p-1">
          {DAY_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                days === opt.days ? "bg-bg-surface text-text-primary shadow-sm" : "text-text-disabled hover:text-text-muted"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="บันทึกทั้งหมด"
            value={loading || !data ? "—" : String(data.kpi.total_readings)}
            sub={data ? `ใน ${data.window_days} วัน` : undefined}
          />
          <KpiCard
            label="วันที่ใช้งาน"
            value={loading || !data ? "—" : String(data.kpi.active_days)}
            sub="days active"
          />
          <KpiCard
            label="Acetone Δ เฉลี่ย"
            value={loading || !data || data.kpi.avg_acetone_delta === null ? "—" : `${data.kpi.avg_acetone_delta.toFixed(2)}`}
            sub="mV"
          />
          <KpiCard
            label="คุณภาพเฉลี่ย"
            value={loading || !data || data.kpi.avg_quality_score === null ? "—" : `${data.kpi.avg_quality_score.toFixed(0)}%`}
            sub={data?.kpi.avg_reliability_score !== null ? `reliability ${data?.kpi.avg_reliability_score?.toFixed(0)}%` : undefined}
          />
        </div>

        {/* Time series chart */}
        <PatientAcetoneChart series={data?.series ?? []} loading={loading || !data} days={days} />

        {/* Donut + Devices row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Label donut */}
          <section className="bg-bg-surface rounded-2xl border border-border-soft p-5">
            <h2 className="font-semibold text-text-primary text-sm mb-4">สัดส่วน Label</h2>
            <div className="h-64 w-full">
              {loading || !data ? (
                <div className="w-full h-full bg-bg-elevated rounded-xl animate-pulse" />
              ) : donutData.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-sm text-text-disabled">
                  ไม่มีข้อมูล
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                      isAnimationActive={false}
                    >
                      {donutData.map((entry) => (
                        <Cell key={entry.name} fill={LABEL_COLOR[entry.name] ?? "var(--color-text-disabled)"} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(v, name) => [v as number, LABEL_TH[name as string] ?? (name as string)]}
                      contentStyle={{
                        borderRadius: 8, border: "1px solid var(--color-border-soft)", fontSize: 12,
                        background: "var(--color-bg-surface)", color: "var(--color-text-primary)",
                      }}
                    />
                    <Legend
                      formatter={(name: string) => <span className="text-xs text-text-muted">{LABEL_TH[name] ?? name}</span>}
                      iconType="circle"
                    />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          {/* Devices */}
          <section className="bg-bg-surface rounded-2xl border border-border-soft p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-text-primary text-sm">อุปกรณ์ ({data?.devices.length ?? 0})</h2>
              {data && (
                <button
                  onClick={() => setLinkOpen(true)}
                  className="text-xs text-info font-medium px-2.5 py-1 rounded-lg bg-info/10 hover:bg-info/20 transition"
                >
                  + Link Device
                </button>
              )}
            </div>
            {loading || !data ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-16 bg-bg-elevated rounded-xl animate-pulse" />
                ))}
              </div>
            ) : data.devices.length === 0 ? (
              <div className="text-sm text-text-disabled py-8 text-center">ไม่มีอุปกรณ์</div>
            ) : (
              <div className="space-y-2">
                {data.devices.map((d) => {
                  const online = d.last_seen_at && new Date(d.last_seen_at).getTime() > Date.now() - 5 * 60 * 1000;
                  return (
                    <div key={d.id} className="border border-border-soft rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full ${online ? "bg-success" : "bg-text-disabled"}`} />
                          <span className="text-sm font-medium text-text-primary">{d.sensor_model || d.kind}</span>
                          {d.needs_recalibration && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-warning/15 text-warning rounded-full font-medium">
                              recalibrate
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-text-disabled">{d.total_readings} readings</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <div className="text-text-disabled">Last seen</div>
                          <div className="text-text-muted">
                            {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" }) : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-text-disabled">Baseline</div>
                          <div className="text-text-muted">
                            {d.baseline_voc !== null ? `${d.baseline_voc.toFixed(3)} V` : "—"}
                          </div>
                        </div>
                        <div>
                          <div className="text-text-disabled">Drift</div>
                          <div className="text-text-muted">
                            {d.drift_score !== null ? d.drift_score.toFixed(2) : "—"}
                          </div>
                        </div>
                      </div>
                      <div className="text-[10px] text-text-disabled font-mono mt-2 truncate">{d.id}</div>
                      <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-border-soft">
                        <a
                          href={`/me/device/${d.id}/report`}
                          className="text-center text-xs text-info font-medium py-1 rounded-lg bg-info/10 hover:bg-info/20 transition-colors"
                        >
                          Calibration &amp; reports
                        </a>
                        <a
                          href={`/me/device/${d.id}/history`}
                          className="text-center text-xs text-mint-600 font-medium py-1 rounded-lg bg-mint-500/10 hover:bg-mint-500/20 transition-colors"
                        >
                          Sensor data &amp; history
                        </a>
                        <a
                          href={`/me/device/${d.id}/settings`}
                          className="text-center text-xs text-text-muted font-medium py-1 rounded-lg bg-bg-elevated hover:bg-border-soft transition-colors"
                        >
                          Sensor settings
                        </a>
                        <a
                          href={`/me/device/${d.id}/firmware`}
                          className="text-center text-xs text-text-muted font-medium py-1 rounded-lg bg-bg-elevated hover:bg-border-soft transition-colors"
                        >
                          Download firmware (.ino)
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Recent readings */}
        <section className="bg-bg-surface rounded-2xl border border-border-soft p-5">
          <h2 className="font-semibold text-text-primary text-sm mb-1">
            บันทึกล่าสุด (20 รายการ)
          </h2>
          <p className="text-xs text-text-disabled mb-4">คลิกที่แถวเพื่อดูรายละเอียดทุกฟิลด์</p>
          {loading || !data ? (
            <div className="space-y-1.5">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-10 bg-bg-elevated rounded animate-pulse" />
              ))}
            </div>
          ) : data.recent.length === 0 ? (
            <div className="text-sm text-text-disabled py-8 text-center">ไม่มีข้อมูล</div>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-text-disabled border-b border-border-soft">
                    <th className="w-6 px-2 py-2" />
                    <th className="text-left font-medium px-3 py-2">เวลา</th>
                    <th className="text-right font-medium px-3 py-2">Acetone Δ</th>
                    <th className="text-right font-medium px-3 py-2">Pressure</th>
                    <th className="text-right font-medium px-3 py-2">Temp/Hum</th>
                    <th className="text-right font-medium px-3 py-2">Quality</th>
                    <th className="text-right font-medium px-5 py-2">Label</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((r, idx) => (
                    <RecentRow key={`${r.time}-${idx}`} r={r} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Ketone logs */}
        {data && data.ketone_logs.length > 0 && (
          <section className="bg-bg-surface rounded-2xl border border-border-soft p-5">
            <h2 className="font-semibold text-text-primary text-sm mb-4">
              Ketone logs (30 วันล่าสุด · {data.ketone_logs.length} รายการ)
            </h2>
            <div className="space-y-2">
              {data.ketone_logs.map((k, i) => (
                <div key={i} className="flex items-center justify-between text-sm border border-border-soft rounded-lg px-3 py-2">
                  <div>
                    <span className="text-text-primary font-medium">
                      {k.ketone_type === "urine" ? `Urine · ${k.urine_category}` : `Blood · ${k.value_mmol?.toFixed(2) ?? "—"} mmol/L`}
                    </span>
                    <span className="text-xs text-text-disabled ml-2">{k.source ?? ""}</span>
                  </div>
                  <div className="text-xs text-text-muted">
                    {new Date(k.ts).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>

    {linkOpen && data && (
      <LinkDeviceModal
        userId={data.user.id}
        userEmail={data.user.email}
        onClose={() => setLinkOpen(false)}
        onLinked={() => {
          const id = params?.id;
          if (!id) return;
          api.admin.userDashboard(id, days).then(setData).catch(() => {});
        }}
      />
    )}
    </>
  );
}
